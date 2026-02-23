import type { CodeAction, CodeActionParams, TextEdit } from 'vscode-languageserver/node';
import { CodeActionKind } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable } from '@gist-lang/workspace';

/**
 * Compute code actions (quick fixes) for diagnostics at the given range.
 */
export function computeCodeActions(
  document: TextDocument,
  params: CodeActionParams,
  symbols: SymbolTable | undefined,
): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diagnostic of params.context.diagnostics) {
    const msg = diagnostic.message;

    // Quick fix: create missing model/type
    const undeclaredMatch = msg.match(/Undeclared type '(\w+)'/);
    if (undeclaredMatch) {
      const typeName = undeclaredMatch[1];
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
