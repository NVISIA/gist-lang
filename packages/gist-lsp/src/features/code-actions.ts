import type { CodeAction, CodeActionParams, TextEdit } from 'vscode-languageserver/node';
import { CodeActionKind } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import type { SymbolTable, ProjectSymbolTable } from '@gist-lang/workspace';
import type { UseNode } from '@gist-lang/parser';

/**
 * Compute code actions (quick fixes) for diagnostics at the given range.
 */
export function computeCodeActions(
  document: TextDocument,
  params: CodeActionParams,
  symbols: SymbolTable | undefined,
  project?: ProjectSymbolTable,
): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diagnostic of params.context.diagnostics) {
    const msg = diagnostic.message;

    // Quick fix: create missing model/type
    const undeclaredMatch = msg.match(/Undeclared type '(\w+)'/);
    if (undeclaredMatch) {
      const typeName = undeclaredMatch[1];

      // Auto-import first, if available
      if (project) {
        const hit = project.isExportedFromSibling(typeName);
        if (hit) {
          const autoImport = createAutoImportAction(document, hit.sourceFile, hit.suggestedAlias, typeName, project);
          if (autoImport) actions.push(autoImport);
        }
      }

      actions.push(
        createModelAction(document, typeName),
        createEnumAction(document, typeName),
        createErrorAction(document, typeName),
      );
    }

    // Quick fix: create missing trait for spread
    const spreadMatch = msg.match(/spreads undeclared trait '(\w+)'/);
    if (spreadMatch) {
      const traitName = spreadMatch[1];
      actions.push(createTraitAction(document, traitName));
    }
  }

  return actions;
}

/** Build an auto-import quick-fix that inserts or extends a `use` statement. */
function createAutoImportAction(
  document: TextDocument,
  targetAbsPath: string,
  suggestedAlias: string,
  typeName: string,
  project: ProjectSymbolTable,
): CodeAction | null {
  const docPath = project.currentFile;
  const relRaw = path.relative(path.dirname(docPath), targetAbsPath);
  const rel = relRaw.startsWith('.') ? relRaw : `./${relRaw}`;

  // If a `use` for this target already exists with an alias, extend its exposing list.
  const existingImports = project.graph.byFile.get(docPath);
  if (existingImports) {
    for (const imp of existingImports.values()) {
      if (imp.targetPath === targetAbsPath && imp.node.alias) {
        // Build a TextEdit that appends the name to the existing `exposing` list,
        // or inserts one if it's missing.
        const edit = extendExistingUse(document, imp.node, typeName);
        if (edit) {
          return {
            title: `Import '${typeName}' from '${rel}'`,
            kind: CodeActionKind.QuickFix,
            edit: { changes: { [document.uri]: [edit] } },
          };
        }
      }
    }
  }

  // Otherwise insert a brand-new `use` line.
  // Pick a non-colliding alias.
  let alias = suggestedAlias;
  if (existingImports?.has(alias)) {
    let i = 2;
    while (existingImports.has(`${alias}${i}`)) i++;
    alias = `${alias}${i}`;
  }

  const lines = document.getText().split('\n');
  const insertLine = findUseInsertionPoint(lines);
  const prefix = insertLine === 0 && lines[0] === '' ? '' : '\n';
  const newText = `${prefix}use "${rel}" as ${alias} exposing ${typeName}\n`;

  return {
    title: `Import '${typeName}' from '${rel}'`,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: {
        [document.uri]: [{
          range: {
            start: { line: insertLine, character: 0 },
            end: { line: insertLine, character: 0 },
          },
          newText,
        }],
      },
    },
  };
}

/** Build a TextEdit that appends `typeName` to an existing `use … exposing` list. */
function extendExistingUse(
  document: TextDocument,
  useNode: UseNode,
  typeName: string,
): TextEdit | null {
  const text = document.getText();
  const lines = text.split('\n');
  const lineIdx = useNode.span.start.line;
  const line = lines[lineIdx];
  if (!line) return null;

  if (useNode.exposing && useNode.exposing.length > 0) {
    if (useNode.exposing.some(e => e.name === typeName)) return null; // already there
    // Insert right after the last exposed name's span end. This sidesteps
    // any trailing `//` comment or whitespace that `line.length` would land in.
    const lastExposed = useNode.exposing[useNode.exposing.length - 1]!;
    const { line: endLine, column: endCol } = lastExposed.span.end;
    return {
      range: {
        start: { line: endLine, character: endCol },
        end: { line: endLine, character: endCol },
      },
      newText: `, ${typeName}`,
    };
  }

  // No exposing clause yet — append ` exposing <typeName>` before any
  // trailing `//` comment (and before its leading whitespace).
  const insertCol = columnBeforeTrailingComment(line);
  return {
    range: {
      start: { line: lineIdx, character: insertCol },
      end: { line: lineIdx, character: insertCol },
    },
    newText: ` exposing ${typeName}`,
  };
}

/**
 * Return the column of the first character of a trailing `//` line comment,
 * backed up past any whitespace between the code and the comment. If there
 * is no trailing comment, return the length of the line's right-trimmed text.
 * Ignores `//` sequences that appear inside string literals.
 */
function columnBeforeTrailingComment(line: string): number {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== '\\') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === '/' && line[i + 1] === '/') {
      // Back up past whitespace preceding the comment.
      let j = i;
      while (j > 0 && (line[j - 1] === ' ' || line[j - 1] === '\t')) j--;
      return j;
    }
  }
  // No trailing comment — trim trailing whitespace.
  return line.replace(/\s+$/, '').length;
}

/** Find a line to insert a new `use` statement. Prefer below any existing `use`, else below project header, else top. */
function findUseInsertionPoint(lines: string[]): number {
  let lastUse = -1;
  let projectEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('use ')) lastUse = i;
    if (trimmed.startsWith('project ')) {
      // Project block ends when indentation returns to 0 on a non-empty line.
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith('  ') || lines[j].trim() === '')) j++;
      projectEnd = j;
    }
  }
  if (lastUse >= 0) return lastUse + 1;
  if (projectEnd >= 0) return projectEnd;
  return 0;
}

function createModelAction(document: TextDocument, name: string): CodeAction {
  const text = document.getText();
  const lines = text.split('\n');
  const insertLine = findInsertionPoint(lines);
  const newText = `\n${name} = {\n  // TODO: add fields\n}\n`;

  return {
    title: `Create model '${name}'`,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: {
        [document.uri]: [{
          range: {
            start: { line: insertLine, character: 0 },
            end: { line: insertLine, character: 0 },
          },
          newText,
        }],
      },
    },
  };
}

function createEnumAction(document: TextDocument, name: string): CodeAction {
  const text = document.getText();
  const lines = text.split('\n');
  const insertLine = findInsertionPoint(lines);
  const newText = `\n${name} = value1 | value2\n`;

  return {
    title: `Create enum '${name}'`,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: {
        [document.uri]: [{
          range: {
            start: { line: insertLine, character: 0 },
            end: { line: insertLine, character: 0 },
          },
          newText,
        }],
      },
    },
  };
}

function createErrorAction(document: TextDocument, name: string): CodeAction {
  const text = document.getText();
  const lines = text.split('\n');
  const insertLine = findInsertionPoint(lines);
  const newText = `\n${name} = error {\n  message: string\n}\n`;

  return {
    title: `Create error '${name}'`,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: {
        [document.uri]: [{
          range: {
            start: { line: insertLine, character: 0 },
            end: { line: insertLine, character: 0 },
          },
          newText,
        }],
      },
    },
  };
}

function createTraitAction(document: TextDocument, name: string): CodeAction {
  const text = document.getText();
  const lines = text.split('\n');
  const insertLine = findInsertionPoint(lines);
  const newText = `\ntrait ${name} {\n  // TODO: add fields\n}\n`;

  return {
    title: `Create trait '${name}'`,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: {
        [document.uri]: [{
          range: {
            start: { line: insertLine, character: 0 },
            end: { line: insertLine, character: 0 },
          },
          newText,
        }],
      },
    },
  };
}

/**
 * Find a good insertion point for new declarations.
 * Insert after the last model/enum/type/trait/error declaration,
 * or after the project header, or at the top.
 */
function findInsertionPoint(lines: string[]): number {
  let lastDeclEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimStart();
    // Look for the start of a module block — insert before it
    if (line.startsWith('module ')) {
      return i;
    }
    // Track end of data declarations
    if (line.match(/^\w+\s*=\s*\{/) || // Model
        line.match(/^\w+\s*=\s*\w+/) ||  // Enum or constant
        line.startsWith('trait ') ||
        line.startsWith('type ') ||
        line.match(/^\w+\s*=\s*error\s/)) {
      lastDeclEnd = i + 1;
      // Walk to end of block
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1] === '' || lines[i + 1] === '}')) {
        i++;
        lastDeclEnd = i + 1;
        if (lines[i].trim() === '}') break;
      }
    }
  }

  return lastDeclEnd;
}
