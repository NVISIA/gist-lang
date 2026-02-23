import type { Position, Location } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable } from '@gist-lang/workspace';

/**
 * Compute go-to-definition for a word at the given position.
 * Returns the location of the symbol's declaration.
 */
export function computeDefinition(
  document: TextDocument,
  position: Position,
  symbols: SymbolTable | undefined,
): Location | null {
  if (!symbols) return null;

  const word = getWordAtPosition(document, position);
  if (!word) return null;

  // Look up the symbol declaration
  const infos = symbols.getSymbols(word);
  if (infos.length === 0) return null;

  // Return the first declaration
  const info = infos[0];
  return {
    uri: document.uri,
    range: {
      start: { line: info.span.start.line, character: info.span.start.column },
      end: { line: info.span.end.line, character: info.span.end.column },
    },
  };
}

function getWordAtPosition(document: TextDocument, position: Position): string | null {
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
  return line.slice(start, end);
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}
