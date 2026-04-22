import type { Hover, Position } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable, ProjectSymbolTable } from '@gist-lang/workspace';
import type { KitRegistry } from '@gist-lang/workspace';
import { getQualifiedRefAtPosition } from './definition.js';

/**
 * Compute hover information for a word at the given position.
 */
export function computeHover(
  document: TextDocument,
  position: Position,
  symbols: SymbolTable | undefined,
  kitRegistry: KitRegistry | null,
  project?: ProjectSymbolTable,
): Hover | null {
  // Qualified reference: resolve via project and render the target's decl.
  const qualified = getQualifiedRefAtPosition(document, position);
  if (qualified && project) {
    if (qualified.part === 'alias') {
      const imp = project.getImport(qualified.alias);
      if (imp) {
        const exposingInfo = imp.exposing
          ? `exposing ${[...imp.exposing].join(', ')}`
          : '(all symbols)';
        return {
          contents: {
            kind: 'markdown',
            value: `**\`${qualified.alias}\`** — Import alias\n\nTarget: \`${imp.rawTarget}\`\n\n${exposingInfo}`,
          },
        };
      }
    } else {
      const hover = hoverForQualified(project, qualified.alias, qualified.name);
      if (hover) return hover;
    }
  }

  const word = getWordAtPosition(document, position);
  if (!word) return null;

  // Try kit keywords first
  if (kitRegistry) {
    const construct = kitRegistry.getConstruct(word);
    if (construct) {
      const kit = kitRegistry.getKitForKeyword(word);
      const lines: string[] = [];
      lines.push(`**\`${word}\`** — Kit construct (${kit})`);
      if (construct.doc) lines.push('', construct.doc);
      lines.push('', `Kind: \`${construct.kind}\``);
      if (construct.nameStyle !== 'none') lines.push(`Name style: \`${construct.nameStyle}\``);
      if (Object.keys(construct.fields).length > 0) {
        lines.push('', '**Fields:**');
        for (const [fname, field] of Object.entries(construct.fields)) {
          const req = field.required ? ' *(required)*' : '';
          const doc = field.doc ? ` — ${field.doc}` : '';
          const vals = field.values ? ` (${field.values.join(' | ')})` : '';
          lines.push(`- \`${fname}\`${req}${doc}${vals}`);
        }
      }
      if (construct.children?.length) {
        lines.push('', `Children: ${construct.children.map(c => `\`${c}\``).join(', ')}`);
      }
      return { contents: { kind: 'markdown', value: lines.join('\n') } };
    }
  }

  // No symbol table available
  if (!symbols) return null;

  // Models
  const model = symbols.models.get(word);
  if (model) {
    const lines: string[] = [];
    lines.push(`**\`${word}\`** — Model`);
    if (model.modifier) lines.push(`Modifier: \`${model.modifier}\``);
    const fields = symbols.getResolvedFields(word);
    if (fields.length > 0) {
      lines.push('', '**Fields:**');
      for (const f of fields) {
        const type = f.type ? formatTypeRef(f.type) : 'any';
        const opt = f.optional ? '?' : '';
        const mods = f.modifiers.length > 0 ? ` *(${f.modifiers.join(', ')})*` : '';
        lines.push(`- \`${f.name}${opt}: ${type}\`${mods}`);
      }
    }
    if (model.spreads.length > 0) {
      lines.push(
        '',
        `Spreads: ${model.spreads
          .map(s => `\`...${s.alias ? `${s.alias}.${s.name}` : s.name}\``)
          .join(', ')}`,
      );
    }
    return { contents: { kind: 'markdown', value: lines.join('\n') } };
  }

  // Enums
  const enumDecl = symbols.enums.get(word);
  if (enumDecl) {
    const values = enumDecl.values.join(' | ');
    return {
      contents: {
        kind: 'markdown',
        value: `**\`${word}\`** — Enum\n\nValues: \`${values}\``,
      },
    };
  }

  // Traits
  const trait = symbols.traits.get(word);
  if (trait) {
    const lines: string[] = [`**\`${word}\`** — Trait`];
    if (trait.fields.length > 0) {
      lines.push('', '**Fields:**');
      for (const f of trait.fields) {
        const type = f.type ? formatTypeRef(f.type) : 'any';
        lines.push(`- \`${f.name}: ${type}\``);
      }
    }
    return { contents: { kind: 'markdown', value: lines.join('\n') } };
  }

  // Types
  const typeDecl = symbols.types.get(word);
  if (typeDecl) {
    const base = typeDecl.baseType ? formatTypeRef(typeDecl.baseType) : 'unknown';
    return {
      contents: {
        kind: 'markdown',
        value: `**\`${word}\`** — Type alias\n\nBase: \`${base}\``,
      },
    };
  }

  // Errors
  const errorDecl = symbols.errors.get(word);
  if (errorDecl) {
    const lines: string[] = [`**\`${word}\`** — Error`];
    if (errorDecl.fields.length > 0) {
      lines.push('', '**Fields:**');
      for (const f of errorDecl.fields) {
        const type = f.type ? formatTypeRef(f.type) : 'any';
        lines.push(`- \`${f.name}: ${type}\``);
      }
    }
    return { contents: { kind: 'markdown', value: lines.join('\n') } };
  }

  // State machines
  const sm = symbols.stateMachines.get(word);
  if (sm) {
    const lines: string[] = [`**\`${word}\`** — State machine`];
    if (sm.forModel) lines.push(`For: \`${sm.forModel}.${sm.forField ?? '?'}\``);
    if (sm.transitions.length > 0) {
      lines.push('', '**Transitions:**');
      for (const t of sm.transitions) {
        lines.push(`- \`${t.from}\` → \`${t.to}\``);
      }
    }
    return { contents: { kind: 'markdown', value: lines.join('\n') } };
  }

  // Modules
  const mod = symbols.modules.get(word);
  if (mod) {
    const lines: string[] = [`**\`${word}\`** — Module`];
    if (mod.context.length > 0) {
      lines.push('', mod.context.map(c => `> ${c}`).join('\n'));
    }
    if (mod.intents.length > 0) {
      lines.push('', '**Intents:**');
      for (const intent of mod.intents) {
        const params = intent.params.map(p => p.name).join(', ');
        const ret = intent.returnType ? ` → ${formatTypeRef(intent.returnType)}` : '';
        lines.push(`- \`to ${intent.name}(${params})${ret}\``);
      }
    }
    if (mod.fns.length > 0) {
      lines.push('', '**Functions:**');
      for (const fn of mod.fns) {
        const params = fn.params.map(p => p.name).join(', ');
        const ret = fn.returnType ? ` → ${formatTypeRef(fn.returnType)}` : '';
        lines.push(`- \`fn ${fn.name}(${params})${ret}\``);
      }
    }
    if (mod.flows.length > 0) {
      lines.push('', '**Flows:**');
      for (const flow of mod.flows) {
        lines.push(`- \`flow ${flow.name}\``);
      }
    }
    return { contents: { kind: 'markdown', value: lines.join('\n') } };
  }

  // Intents (check by simple name across all modules)
  for (const [qualName, entry] of symbols.intents) {
    if (entry.intent.name === word) {
      const intent = entry.intent;
      const params = intent.params.map(p => {
        const type = p.type ? `: ${formatTypeRef(p.type)}` : '';
        return `${p.name}${type}`;
      }).join(', ');
      const ret = intent.returnType ? ` → ${formatTypeRef(intent.returnType)}` : '';
      const lines: string[] = [`**\`to ${word}(${params})${ret}\`**`];
      lines.push(`Module: \`${entry.module}\``);
      if (intent.route) lines.push(`Route: \`${intent.route.method} ${intent.route.path}\``);
      if (intent.saves?.length) lines.push(`Saves: ${intent.saves.map(s => `\`${s}\``).join(', ')}`);
      if (intent.emits?.length) lines.push(`Emits: ${intent.emits.map(e => `\`${e}\``).join(', ')}`);
      if (intent.guard?.length) lines.push(`Guard: ${intent.guard.join(', ')}`);
      appendExtensions(lines, project, word, entry.module);
      return { contents: { kind: 'markdown', value: lines.join('\n') } };
    }
  }

  // Functions (check by simple name)
  for (const [qualName, entry] of symbols.fns) {
    if (entry.fn.name === word) {
      const fn = entry.fn;
      const params = fn.params.map(p => {
        const type = p.type ? `: ${formatTypeRef(p.type)}` : '';
        return `${p.name}${type}`;
      }).join(', ');
      const ret = fn.returnType ? ` → ${formatTypeRef(fn.returnType)}` : '';
      const lines: string[] = [
        `**\`fn ${word}(${params})${ret}\`**`,
        `Module: \`${entry.module}\``,
      ];
      appendExtensions(lines, project, word, entry.module);
      return { contents: { kind: 'markdown', value: lines.join('\n') } };
    }
  }

  // Flows (check by simple name)
  for (const [qualName, entry] of symbols.flows) {
    if (entry.flow.name === word) {
      const flow = entry.flow;
      const stages = flow.stages.map(s => `\`${s.name}\``).join(' → ');
      return {
        contents: {
          kind: 'markdown',
          value: `**\`flow ${word}\`**\n\nModule: \`${entry.module}\`\nStages: ${stages}`,
        },
      };
    }
  }

  // Services (from uses: position)
  const svc = symbols.services.get(word);
  if (svc) {
    const lines: string[] = [`**\`${word}\`** — Service`];
    if (svc.type) lines.push(`Type: \`${svc.type}\``);
    if (svc.base_url) lines.push(`URL: \`${svc.base_url}\``);
    if (svc.base_url_env) lines.push(`URL env: \`${svc.base_url_env}\``);
    return { contents: { kind: 'markdown', value: lines.join('\n') } };
  }

  // Constants
  const constant = symbols.constants.get(word);
  if (constant) {
    return {
      contents: {
        kind: 'markdown',
        value: `**\`${word}\`** — Constant\n\nValue: \`${constant.value}\``,
      },
    };
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Extract the word at a given position in the document.
 */
function getWordAtPosition(document: TextDocument, position: Position): string | null {
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[position.line];
  if (!line) return null;

  const col = position.character;

  // Expand left
  let start = col;
  while (start > 0 && isWordChar(line[start - 1])) start--;

  // Expand right
  let end = col;
  while (end < line.length && isWordChar(line[end])) end++;

  if (start === end) return null;
  return line.slice(start, end);
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}

/** Render a hover for `alias.Name` by delegating to the imported file's decl. */
function hoverForQualified(
  project: ProjectSymbolTable,
  alias: string,
  name: string,
): Hover | null {
  const resolved = project.resolveTypeName({ alias, name });
  if (!resolved) return null;

  const lines: string[] = [];
  switch (resolved.kind) {
    case 'model': {
      const model = resolved.decl as import('@gist-lang/parser').ModelDeclaration;
      lines.push(`**\`${alias}.${name}\`** — Model (from \`${shortPath(resolved.sourceFile)}\`)`);
      if (model.modifier) lines.push(`Modifier: \`${model.modifier}\``);
      if (model.fields.length > 0) {
        lines.push('', '**Fields:**');
        for (const f of model.fields) {
          const type = f.type ? formatTypeRef(f.type) : 'any';
          const opt = f.optional ? '?' : '';
          lines.push(`- \`${f.name}${opt}: ${type}\``);
        }
      }
      if (model.spreads.length > 0) {
        lines.push(
          '',
          `Spreads: ${model.spreads
            .map(s => `\`...${s.alias ? `${s.alias}.${s.name}` : s.name}\``)
            .join(', ')}`,
        );
      }
      break;
    }
    case 'trait': {
      const trait = resolved.decl as import('@gist-lang/parser').TraitDeclaration;
      lines.push(`**\`${alias}.${name}\`** — Trait (from \`${shortPath(resolved.sourceFile)}\`)`);
      if (trait.fields.length > 0) {
        lines.push('', '**Fields:**');
        for (const f of trait.fields) {
          const type = f.type ? formatTypeRef(f.type) : 'any';
          lines.push(`- \`${f.name}: ${type}\``);
        }
      }
      break;
    }
    case 'type': {
      const typeDecl = resolved.decl as import('@gist-lang/parser').TypeDeclaration;
      const base = typeDecl.baseType ? formatTypeRef(typeDecl.baseType) : 'unknown';
      lines.push(
        `**\`${alias}.${name}\`** — Type alias (from \`${shortPath(resolved.sourceFile)}\`)`,
        `Base: \`${base}\``,
      );
      break;
    }
    case 'enum': {
      const enumDecl = resolved.decl as import('@gist-lang/parser').EnumDeclaration;
      lines.push(
        `**\`${alias}.${name}\`** — Enum (from \`${shortPath(resolved.sourceFile)}\`)`,
        `Values: \`${enumDecl.values.join(' | ')}\``,
      );
      break;
    }
    case 'error': {
      const errDecl = resolved.decl as import('@gist-lang/parser').ErrorDeclaration;
      lines.push(`**\`${alias}.${name}\`** — Error (from \`${shortPath(resolved.sourceFile)}\`)`);
      if (errDecl.fields.length > 0) {
        lines.push('', '**Fields:**');
        for (const f of errDecl.fields) {
          const type = f.type ? formatTypeRef(f.type) : 'any';
          lines.push(`- \`${f.name}: ${type}\``);
        }
      }
      break;
    }
    default:
      return null;
  }
  return { contents: { kind: 'markdown', value: lines.join('\n') } };
}

function shortPath(fsPath: string): string {
  const parts = fsPath.split('/');
  return parts[parts.length - 1] ?? fsPath;
}

/** Append an "Extended by" / "Refined by" section to hover lines, if any apply. */
function appendExtensions(
  lines: string[],
  project: ProjectSymbolTable | undefined,
  intentName: string,
  moduleName?: string,
): void {
  if (!project) return;
  const extensions = project.getExtensionsFor(intentName, moduleName);
  if (extensions.length === 0) return;

  const extends_ = extensions.filter(e => e.kind === 'extend');
  const refines = extensions.filter(e => e.kind === 'refine');

  if (extends_.length > 0) {
    lines.push('', '---', '**Extended by:**');
    for (const ext of extends_) {
      lines.push(`- \`extend ${intentName}\` — _${shortPath(ext.sourceFile)}_`);
      for (const proseLine of ext.body) {
        lines.push(`  > ${proseLine}`);
      }
    }
  }

  if (refines.length > 0) {
    lines.push('', '---', '**Refined by:**');
    for (const ref of refines) {
      lines.push(`- \`refine ${intentName}\` — _${shortPath(ref.sourceFile)}_`);
      for (const proseLine of ref.body) {
        lines.push(`  > ${proseLine}`);
      }
    }
  }
}

/**
 * Format a TypeRef into a readable string.
 */
function formatTypeRef(ref: import('@gist-lang/parser').TypeRef): string {
  let base: string;
  switch (ref.base.kind) {
    case 'primitive':
      base = ref.base.name;
      break;
    case 'named':
      base = ref.base.name;
      break;
    case 'qualified':
      base = `${ref.base.alias}.${ref.base.name}`;
      break;
    case 'model_ref':
      base = `->${ref.base.target}`;
      break;
    case 'error':
      base = 'error';
      break;
    case 'result':
      base = ref.base.inner ? `result<${formatTypeRef(ref.base.inner)}>` : 'result';
      break;
    case 'map':
      base = `map<${ref.base.key ? formatTypeRef(ref.base.key) : '?'}, ${ref.base.value ? formatTypeRef(ref.base.value) : '?'}>`;
      break;
    case 'inline_struct':
      base = `{ ${ref.base.fields.map(f => f.name).join(', ')} }`;
      break;
    default:
      base = '?';
  }
  if (ref.array) base += '[]';
  if (ref.optional) base += '?';
  if (ref.union?.length) {
    base = [base, ...ref.union.map(u => formatTypeRef(u))].join(' | ');
  }
  return base;
}
