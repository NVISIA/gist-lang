import type { Position, WorkspaceEdit, TextEdit, Range } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable } from '@gist-lang/workspace';

/**
 * Prepare a rename: verify the symbol at position can be renamed.
 * Returns the range of the word to rename, or null if not renameable.
 */
export function prepareRename(
  document: TextDocument,
  position: Position,
  symbols: SymbolTable | undefined,
): { range: Range; placeholder: string } | null {
  if (!symbols) return null;

  const wordInfo = getWordInfoAtPosition(document, position);
  if (!wordInfo) return null;

  // Only allow renaming declared symbols
  if (!symbols.isDeclared(wordInfo.word)) return null;

  return {
    range: {
      start: { line: position.line, character: wordInfo.start },
      end: { line: position.line, character: wordInfo.end },
    },
    placeholder: wordInfo.word,
  };
}

/**
 * Compute workspace edits for renaming a symbol.
 */
export function computeRename(
  document: TextDocument,
  position: Position,
  newName: string,
  symbols: SymbolTable | undefined,
): WorkspaceEdit | null {
  if (!symbols) return null;

  const wordInfo = getWordInfoAtPosition(document, position);
  if (!wordInfo) return null;

  const oldName = wordInfo.word;
  if (!symbols.isDeclared(oldName)) return null;
  if (oldName === newName) return null;

  // Collect all occurrences in the document text
  const text = document.getText();
  const edits: TextEdit[] = [];

  // Find all occurrences of the old name as whole words
  const regex = new RegExp(`\\b${escapeRegex(oldName)}\\b`, 'g');
  const lines = text.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
      edits.push({
        range: {
          start: { line: lineNum, character: match.index },
          end: { line: lineNum, character: match.index + oldName.length },
        },
        newText: newName,
      });
    }
  }

  if (edits.length === 0) return null;

  return {
    changes: {
      [document.uri]: edits,
    },
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getWordInfoAtPosition(
  document: TextDocument,
  position: Position,
): { word: string; start: number; end: number } | null {
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[position.line];
  if (!line) return null;

  const col = position.character;
  let start = col;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  let end = col;
  while (end < line.length && isWordChar(line[end])) end++;

  if (start === end) return null;
  return { word: line.slice(start, end), start, end };
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}
