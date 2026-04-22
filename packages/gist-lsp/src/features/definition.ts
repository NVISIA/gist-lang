import type { Position, Location } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable, ProjectSymbolTable } from '@gist-lang/workspace';
import * as path from 'path';

/**
 * Compute go-to-definition for a word at the given position.
 * Returns the location of the symbol's declaration.
 */
export function computeDefinition(
  document: TextDocument,
  position: Position,
  symbols: SymbolTable | undefined,
  project?: ProjectSymbolTable,
): Location | null {
  // Qualified reference: if the cursor is on a token that's part of
  // `<alias>.<Name>`, resolve it via the project table.
  const qualified = getQualifiedRefAtPosition(document, position);
  if (qualified && project) {
    // If the cursor is on the alias, jump to the matching `use` statement.
    if (qualified.part === 'alias') {
      const imp = project.getImport(qualified.alias);
      if (imp) {
        return {
          uri: document.uri,
          range: {
            start: { line: imp.span.start.line, character: imp.span.start.column },
            end: { line: imp.span.end.line, character: imp.span.end.column },
          },
        };
      }
    } else {
      // Cursor on the name portion — jump to the target file's declaration.
      const resolved = project.resolveTypeName({ alias: qualified.alias, name: qualified.name });
      if (resolved) {
        // Find the declaration's span in its source SymbolTable.
        const targetTable = project.graph.symbols.get(resolved.sourceFile);
        const infos = targetTable?.getSymbols(qualified.name) ?? [];
        const info = infos[0];
        if (info) {
          return {
            uri: fsPathToUri(resolved.sourceFile),
            range: {
              start: { line: info.span.start.line, character: info.span.start.column },
              end: { line: info.span.end.line, character: info.span.end.column },
            },
          };
        }
      }
    }
  }

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

/**
 * If the cursor sits on a `<alias>.<Name>` token, return its parts.
 * `part` indicates whether the cursor is on the alias or the name portion.
 */
export function getQualifiedRefAtPosition(
  document: TextDocument,
  position: Position,
): { alias: string; name: string; part: 'alias' | 'name' } | null {
  const line = document.getText().split('\n')[position.line];
  if (!line) return null;
  const col = position.character;

  // Scan word boundaries around the cursor.
  let start = col;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  let end = col;
  while (end < line.length && isWordChar(line[end])) end++;
  if (start === end) return null;

  const word = line.slice(start, end);

  // Case 1: cursor is on the alias → followed by `.TypeName`.
  if (line[end] === '.') {
    const nameStart = end + 1;
    let nameEnd = nameStart;
    while (nameEnd < line.length && isWordChar(line[nameEnd])) nameEnd++;
    if (nameEnd > nameStart && /^[A-Z]/.test(line[nameStart]!)) {
      return { alias: word, name: line.slice(nameStart, nameEnd), part: 'alias' };
    }
  }

  // Case 2: cursor is on the name → preceded by `alias.`.
  if (line[start - 1] === '.') {
    let aliasEnd = start - 1;
    let aliasStart = aliasEnd;
    while (aliasStart > 0 && isWordChar(line[aliasStart - 1])) aliasStart--;
    if (aliasEnd > aliasStart && /^[a-z_]/.test(line[aliasStart]!)) {
      return { alias: line.slice(aliasStart, aliasEnd), name: word, part: 'name' };
    }
  }

  return null;
}

function fsPathToUri(fsPath: string): string {
  const absolute = path.resolve(fsPath);
  if (/^[a-zA-Z]:/.test(absolute)) {
    // Windows drive path
    return 'file:///' + absolute.replace(/\\/g, '/');
  }
  return 'file://' + absolute;
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
