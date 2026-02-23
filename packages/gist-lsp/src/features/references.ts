import type { Position, Location } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable } from '@gist-lang/workspace';

/**
 * Find all references to a symbol at the given position.
 * Returns locations of both the declaration and all reference sites.
 */
export function computeReferences(
  document: TextDocument,
  position: Position,
  symbols: SymbolTable | undefined,
  includeDeclaration: boolean,
): Location[] {
  if (!symbols) return [];

  const word = getWordAtPosition(document, position);
  if (!word) return [];

  const locations: Location[] = [];

  // Include declaration(s) if requested
  if (includeDeclaration) {
    const infos = symbols.getSymbols(word);
    for (const info of infos) {
      locations.push({
        uri: document.uri,
        range: {
          start: { line: info.span.start.line, character: info.span.start.column },
          end: { line: info.span.end.line, character: info.span.end.column },
        },
      });
    }
  }

  // All reference sites
  const refs = symbols.getReferences(word);
  for (const ref of refs) {
    locations.push({
      uri: document.uri,
      range: {
        start: { line: ref.span.start.line, character: ref.span.start.column },
        end: { line: ref.span.end.line, character: ref.span.end.column },
      },
    });
  }

  return locations;
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
