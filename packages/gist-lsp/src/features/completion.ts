import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable } from '@gist-lang/workspace';
import type { KitRegistry, GistProjectConfig } from '@gist-lang/workspace';

// ─── Context detection ──────────────────────────────────────

type CompletionContext =
  | 'top_level'
  | 'project_header'
  | 'module_body'
  | 'intent_body'
  | 'fn_body'
  | 'flow_body'
  | 'type_position'
  | 'uses_position'
  | 'kit_position'
  | 'needs_position'
  | 'saves_position'
  | 'emits_position'
  | 'field_modifier'
  | 'kit_construct_body'
  | 'test_body'
  | 'state_body'
  | 'unknown';

/**
 * Determine the completion context from cursor position and surrounding text.
 */
function detectContext(document: TextDocument, position: Position): CompletionContext {
  const text = document.getText();
  const lines = text.split('\n');
  const lineIdx = position.line;
  const currentLine = lines[lineIdx] ?? '';
  const indent = currentLine.length - currentLine.trimStart().length;
  const trimmed = currentLine.trimStart();

  // Check what keyword is on the current line (before cursor)
  const beforeCursor = currentLine.slice(0, position.character).trimStart();

  // If on a line starting with uses: / needs: / saves: / emits: / kit:
  if (beforeCursor.startsWith('uses:')) return 'uses_position';
  if (beforeCursor.startsWith('kit:')) return 'kit_position';
  if (beforeCursor.startsWith('needs:')) return 'needs_position';
  if (beforeCursor.startsWith('saves:')) return 'saves_position';
  if (beforeCursor.startsWith('emits:')) return 'emits_position';

  // Check if we're in a type position (after : in field declarations)
  // Fields can be at indent 2 (top-level model) or indent 4+ (inside module)
  const colonMatch = beforeCursor.match(/^\w+\s*:\s*$/);
  if (colonMatch && indent >= 2) return 'type_position';
  // After -> (return type)
  if (beforeCursor.includes('->')) return 'type_position';

  // Walk backward to find the enclosing context
  for (let i = lineIdx - 1; i >= 0; i--) {
    const prevLine = lines[i];
    const prevTrimmed = prevLine.trimStart();
    const prevIndent = prevLine.length - prevTrimmed.length;

    // If this previous line has less indentation, it's a potential parent
    if (prevIndent < indent) {
      if (prevTrimmed.startsWith('project ')) return 'project_header';
      if (prevTrimmed.startsWith('module ')) return 'module_body';
      if (/^to\s+\w+/.test(prevTrimmed)) return 'intent_body';
      if (/^fn\s+\w+/.test(prevTrimmed)) return 'fn_body';
      if (/^flow\s+\w+/.test(prevTrimmed)) return 'flow_body';
      if (/^test\s+"/.test(prevTrimmed)) return 'test_body';
      if (/^state\s+\w+/.test(prevTrimmed)) return 'state_body';
      // Kit construct: any kit keyword followed by a name
      if (prevTrimmed.match(/^[a-z_]+\s+\w+/)) {
        // Could be a kit construct if we're nested deep enough
        if (prevIndent >= 2) return 'kit_construct_body';
      }
    }

    // Second level of nesting: module > intent
    if (prevIndent === 0 && indent >= 2) {
      // Only take top-level matches if nothing else matched
    }
  }

  // Check if we're after a field name and modifiers
  if (indent >= 4 && /^\w+\s*:\s*\w+/.test(beforeCursor)) {
    // After type — could be field modifiers
    const afterType = beforeCursor.replace(/^\w+\s*:\s*\w+\s*,?\s*/, '');
    if (afterType === '' || /,\s*$/.test(beforeCursor)) return 'field_modifier';
  }

  // Top-level context
  if (indent === 0) return 'top_level';

  return 'unknown';
}

// ─── Completion items ───────────────────────────────────────

const PRIMITIVE_TYPES: CompletionItem[] = [
  'string', 'int', 'float', 'decimal', 'number',
  'bool', 'date', 'datetime', 'bytes', 'any', 'void',
].map(name => ({
  label: name,
  kind: CompletionItemKind.TypeParameter,
  detail: `Primitive type: ${name}`,
}));

const FIELD_MODIFIERS: CompletionItem[] = [
  { label: 'generated', kind: CompletionItemKind.Keyword, detail: 'Auto-generated value' },
  { label: 'unique', kind: CompletionItemKind.Keyword, detail: 'Unique constraint' },
  { label: 'secret', kind: CompletionItemKind.Keyword, detail: 'Secret/sensitive value' },
  { label: 'computed', kind: CompletionItemKind.Keyword, detail: 'Derived/computed field' },
];

const TOP_LEVEL_KEYWORDS: CompletionItem[] = [
  { label: 'project', kind: CompletionItemKind.Keyword, detail: 'Project declaration', insertText: 'project ${1:name}\n  > ${2:description}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'module', kind: CompletionItemKind.Keyword, detail: 'Module declaration', insertText: 'module ${1:name}\n  > ${2:description}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'type', kind: CompletionItemKind.Keyword, detail: 'Type alias', insertText: 'type ${1:Name} = ${2:base_type}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'trait', kind: CompletionItemKind.Keyword, detail: 'Trait declaration', insertText: 'trait ${1:Name}\n  ${2:field}: ${3:type}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'state', kind: CompletionItemKind.Keyword, detail: 'State machine', insertText: 'state ${1:Name} for ${2:Model}.${3:field}:\n  ${4:from} -> ${5:to}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'test', kind: CompletionItemKind.Keyword, detail: 'Test declaration', insertText: 'test "${1:description}"\n  given:\n    ${2:setup}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'use', kind: CompletionItemKind.Keyword, detail: 'Import composition' },
  { label: 'extend', kind: CompletionItemKind.Keyword, detail: 'Extend a module/model' },
  { label: 'refine', kind: CompletionItemKind.Keyword, detail: 'Refine a module/model' },
];

const PROJECT_HEADER_KEYWORDS: CompletionItem[] = [
  { label: 'kit:', kind: CompletionItemKind.Keyword, detail: 'Kit to load' },
  { label: 'stack:', kind: CompletionItemKind.Keyword, detail: 'Technology stack' },
  { label: 'style:', kind: CompletionItemKind.Keyword, detail: 'Style conventions' },
  { label: 'rules', kind: CompletionItemKind.Keyword, detail: 'Project-wide rules' },
  { label: 'always:', kind: CompletionItemKind.Keyword, detail: 'Always-apply constraints' },
  { label: 'before:', kind: CompletionItemKind.Keyword, detail: 'Before hooks' },
  { label: 'after:', kind: CompletionItemKind.Keyword, detail: 'After hooks' },
];

const MODULE_BODY_KEYWORDS: CompletionItem[] = [
  { label: 'to', kind: CompletionItemKind.Keyword, detail: 'Intent declaration', insertText: 'to ${1:name}(${2:params}) -> ${3:ReturnType}\n  do:\n    ${4:behavior}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'fn', kind: CompletionItemKind.Keyword, detail: 'Pure function', insertText: 'fn ${1:name}(${2:params}) -> ${3:ReturnType}\n  do:\n    ${4:behavior}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'flow', kind: CompletionItemKind.Keyword, detail: 'Multi-stage flow', insertText: 'flow ${1:name}(${2:params}) -> ${3:ReturnType}\n  stage ${4:first}\n    ${5:behavior}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'on', kind: CompletionItemKind.Keyword, detail: 'Event handler', insertText: 'on ${1:EventName}\n  do:\n    ${2:behavior}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'needs:', kind: CompletionItemKind.Keyword, detail: 'Module dependencies' },
  { label: 'before:', kind: CompletionItemKind.Keyword, detail: 'Before hooks' },
  { label: 'after:', kind: CompletionItemKind.Keyword, detail: 'After hooks' },
];

const INTENT_BODY_KEYWORDS: CompletionItem[] = [
  { label: 'route:', kind: CompletionItemKind.Keyword, detail: 'HTTP route' },
  { label: 'guard:', kind: CompletionItemKind.Keyword, detail: 'Authorization guard' },
  { label: 'saves:', kind: CompletionItemKind.Keyword, detail: 'Models written to' },
  { label: 'emits:', kind: CompletionItemKind.Keyword, detail: 'Events emitted' },
  { label: 'uses:', kind: CompletionItemKind.Keyword, detail: 'External services used' },
  { label: 'needs:', kind: CompletionItemKind.Keyword, detail: 'Dependencies' },
  { label: 'schedule:', kind: CompletionItemKind.Keyword, detail: 'Scheduled execution' },
  { label: 'public', kind: CompletionItemKind.Keyword, detail: 'Public API' },
  { label: 'async', kind: CompletionItemKind.Keyword, detail: 'Async operation' },
  { label: 'trace', kind: CompletionItemKind.Keyword, detail: 'Enable tracing' },
  { label: 'do:', kind: CompletionItemKind.Keyword, detail: 'Behavior block' },
  { label: 'code:', kind: CompletionItemKind.Keyword, detail: 'Code/pseudocode block' },
  { label: 'must:', kind: CompletionItemKind.Keyword, detail: 'Constraint (must hold)' },
  { label: 'ensure:', kind: CompletionItemKind.Keyword, detail: 'Post-condition' },
  { label: 'eg:', kind: CompletionItemKind.Keyword, detail: 'Example usage' },
  { label: 'fails:', kind: CompletionItemKind.Keyword, detail: 'Failure scenarios' },
];

const FN_BODY_KEYWORDS: CompletionItem[] = [
  { label: 'do:', kind: CompletionItemKind.Keyword, detail: 'Behavior block' },
  { label: 'code:', kind: CompletionItemKind.Keyword, detail: 'Code/pseudocode block' },
  { label: 'must:', kind: CompletionItemKind.Keyword, detail: 'Constraint (must hold)' },
  { label: 'ensure:', kind: CompletionItemKind.Keyword, detail: 'Post-condition' },
  { label: 'eg:', kind: CompletionItemKind.Keyword, detail: 'Example usage' },
];

const TEST_BODY_KEYWORDS: CompletionItem[] = [
  { label: 'given:', kind: CompletionItemKind.Keyword, detail: 'Test setup/preconditions' },
  { label: 'call', kind: CompletionItemKind.Keyword, detail: 'Call an intent' },
  { label: 'trigger', kind: CompletionItemKind.Keyword, detail: 'Trigger an event' },
  { label: 'then', kind: CompletionItemKind.Keyword, detail: 'Sequential step' },
  { label: 'expect:', kind: CompletionItemKind.Keyword, detail: 'Expected outcome' },
  { label: 'as', kind: CompletionItemKind.Keyword, detail: 'Run as role' },
];

// ─── Main completion function ───────────────────────────────

/**
 * Compute completion items for a given position in a document.
 */
export function computeCompletions(
  document: TextDocument,
  position: Position,
  symbols: SymbolTable | undefined,
  kitRegistry: KitRegistry | null,
  config: GistProjectConfig | null,
): CompletionItem[] {
  const context = detectContext(document, position);
  const items: CompletionItem[] = [];

  switch (context) {
    case 'top_level':
      items.push(...TOP_LEVEL_KEYWORDS);
      // Add kit keywords at top level
      if (kitRegistry) {
        for (const keyword of kitRegistry.getAllKeywords()) {
          const construct = kitRegistry.getConstruct(keyword);
          items.push({
            label: keyword,
            kind: CompletionItemKind.Keyword,
            detail: construct?.doc ?? `Kit keyword (${kitRegistry.getKitForKeyword(keyword)})`,
            insertText: construct?.snippet
              ? construct.snippet
              : construct?.nameStyle === 'PascalCase'
                ? `${keyword} \${1:Name}`
                : construct?.nameStyle === 'none'
                  ? keyword
                  : `${keyword} \${1:name}`,
            insertTextFormat: InsertTextFormat.Snippet,
          });
        }
      }
      break;

    case 'project_header':
      items.push(...PROJECT_HEADER_KEYWORDS);
      break;

    case 'module_body':
      items.push(...MODULE_BODY_KEYWORDS);
      // Add kit keywords that support module-level nesting
      if (kitRegistry) {
        for (const keyword of kitRegistry.getAllKeywords()) {
          const construct = kitRegistry.getConstruct(keyword);
          if (construct?.supports?.includes('to') || construct?.supports?.includes('fn')) {
            items.push({
              label: keyword,
              kind: CompletionItemKind.Keyword,
              detail: construct.doc,
            });
          }
        }
      }
      break;

    case 'intent_body':
      items.push(...INTENT_BODY_KEYWORDS);
      break;

    case 'fn_body':
      items.push(...FN_BODY_KEYWORDS);
      break;

    case 'flow_body':
      items.push(...FN_BODY_KEYWORDS);
      items.push({
        label: 'stage',
        kind: CompletionItemKind.Keyword,
        detail: 'Flow stage',
        insertText: 'stage ${1:name}\n  ${2:behavior}',
        insertTextFormat: InsertTextFormat.Snippet,
      });
      items.push({
        label: 'compensate:',
        kind: CompletionItemKind.Keyword,
        detail: 'Compensation block for rollback',
      });
      break;

    case 'type_position':
      // Primitive types
      items.push(...PRIMITIVE_TYPES);
      // result<T>, map<K,V>
      items.push({
        label: 'result',
        kind: CompletionItemKind.TypeParameter,
        detail: 'Result type (result<T>)',
        insertText: 'result<${1:T}>',
        insertTextFormat: InsertTextFormat.Snippet,
      });
      items.push({
        label: 'map',
        kind: CompletionItemKind.TypeParameter,
        detail: 'Map type (map<K, V>)',
        insertText: 'map<${1:string}, ${2:V}>',
        insertTextFormat: InsertTextFormat.Snippet,
      });
      // All declared type names
      if (symbols) {
        for (const name of symbols.getAllTypeNames()) {
          const kind = symbols.models.has(name) ? CompletionItemKind.Class
            : symbols.enums.has(name) ? CompletionItemKind.Enum
            : symbols.traits.has(name) ? CompletionItemKind.Interface
            : CompletionItemKind.TypeParameter;
          items.push({
            label: name,
            kind,
            detail: symbols.models.has(name) ? 'Model'
              : symbols.enums.has(name) ? 'Enum'
              : symbols.traits.has(name) ? 'Trait'
              : 'Type',
          });
        }
        // Errors as types
        for (const name of symbols.errors.keys()) {
          items.push({
            label: name,
            kind: CompletionItemKind.Event,
            detail: 'Error',
          });
        }
      }
      break;

    case 'uses_position':
      // Services from gist.yaml
      if (symbols) {
        for (const [name, svc] of symbols.services) {
          items.push({
            label: name,
            kind: CompletionItemKind.Module,
            detail: svc.type ? `Service (${svc.type})` : 'Service',
          });
        }
      }
      break;

    case 'kit_position':
      // Available kit names
      if (kitRegistry) {
        for (const name of kitRegistry.getLoadedKitNames()) {
          items.push({
            label: name,
            kind: CompletionItemKind.Module,
            detail: `Kit: ${name}`,
          });
        }
      }
      break;

    case 'needs_position':
      // Model names for dependency injection
      if (symbols) {
        for (const name of symbols.models.keys()) {
          items.push({ label: name, kind: CompletionItemKind.Class, detail: 'Model' });
        }
      }
      break;

    case 'saves_position':
      // Model names for saves
      if (symbols) {
        for (const name of symbols.models.keys()) {
          items.push({ label: name, kind: CompletionItemKind.Class, detail: 'Model' });
        }
      }
      break;

    case 'emits_position':
      // Event names (could be models or custom events)
      if (symbols) {
        for (const name of symbols.models.keys()) {
          items.push({ label: name, kind: CompletionItemKind.Class, detail: 'Model' });
        }
      }
      break;

    case 'field_modifier':
      items.push(...FIELD_MODIFIERS);
      break;

    case 'kit_construct_body':
      // Offer kit construct fields based on context
      if (kitRegistry) {
        for (const keyword of kitRegistry.getAllKeywords()) {
          const construct = kitRegistry.getConstruct(keyword);
          if (construct?.fields) {
            for (const [fieldName, field] of Object.entries(construct.fields)) {
              const values = field.values ?? field.completions;
              items.push({
                label: `${fieldName}:`,
                kind: CompletionItemKind.Property,
                detail: field.doc ?? `Field of ${keyword}`,
                insertText: values
                  ? `${fieldName}: \${1|${values.join(',')}|}`
                  : `${fieldName}: \${1}`,
                insertTextFormat: InsertTextFormat.Snippet,
              });
            }
          }
        }
      }
      break;

    case 'test_body':
      items.push(...TEST_BODY_KEYWORDS);
      break;

    case 'state_body':
      // Offer state names from the file if we have symbols
      items.push({
        label: 'on enter',
        kind: CompletionItemKind.Keyword,
        detail: 'Hook: on entering state',
        insertText: 'on enter ${1:state_name}:\n  ${2:behavior}',
        insertTextFormat: InsertTextFormat.Snippet,
      });
      items.push({
        label: 'on while',
        kind: CompletionItemKind.Keyword,
        detail: 'Hook: while in state',
        insertText: 'on while ${1:state_name}:\n  ${2:behavior}',
        insertTextFormat: InsertTextFormat.Snippet,
      });
      break;

    case 'unknown':
    default:
      // Provide a basic set when we can't determine context
      items.push(...TOP_LEVEL_KEYWORDS);
      break;
  }

  return items;
}
