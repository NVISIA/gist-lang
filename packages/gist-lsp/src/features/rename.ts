import type { Position, WorkspaceEdit, TextEdit, Range } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable, ProjectSymbolTable } from '@gist-lang/workspace';
import * as path from 'path';

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
 *
 * If a ProjectSymbolTable is provided AND the symbol is a top-level type name,
 * the rename propagates across importing files: qualified references
 * (`alias.OldName` → `alias.NewName`) and `exposing` list entries.
 */
export function computeRename(
  document: TextDocument,
  position: Position,
  newName: string,
  symbols: SymbolTable | undefined,
  project?: ProjectSymbolTable,
  documents?: (uri: string) => TextDocument | undefined,
): WorkspaceEdit | null {
  if (!symbols) return null;

  const wordInfo = getWordInfoAtPosition(document, position);
  if (!wordInfo) return null;

  const oldName = wordInfo.word;
  if (!symbols.isDeclared(oldName)) return null;
  if (oldName === newName) return null;

  const changes: Record<string, TextEdit[]> = {};

  // Local edits in the current document (all whole-word occurrences).
  changes[document.uri] = collectWholeWordEdits(document.getText(), oldName, newName);

  // If it's a type-level symbol AND we have a project table, propagate across
  // importing files.
  if (project && symbols.isTypeName(oldName)) {
    const currentFsPath = project.currentFile;

    for (const [otherPath, otherImports] of project.graph.byFile) {
      if (otherPath === currentFsPath) continue;

      // Does `otherPath` import currentFsPath? If yes, under what alias?
      for (const imp of otherImports.values()) {
        if (imp.targetPath !== currentFsPath) continue;
        const alias = imp.aliasName;

        // Read the importing file's text.
        const otherUri = fsPathToUri(otherPath);
        const doc = documents?.(otherUri);
        const otherText = doc
          ? doc.getText()
          : safeReadFile(otherPath);
        if (otherText === null) continue;

        const otherEdits: TextEdit[] = [];

        // 1. Rewrite `alias.OldName` → `alias.NewName` across the file.
        const qualifiedRegex = new RegExp(
          `\\b${escapeRegex(alias)}\\.${escapeRegex(oldName)}\\b`,
          'g',
        );
        const lines = otherText.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          qualifiedRegex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = qualifiedRegex.exec(line)) !== null) {
            // Replace only the name portion, not the alias.
            const nameStart = match.index + alias.length + 1;
            otherEdits.push({
              range: {
                start: { line: lineNum, character: nameStart },
                end: { line: lineNum, character: nameStart + oldName.length },
              },
              newText: newName,
            });
          }
        }

        // 2. Rewrite the exposing list, if it contains OldName.
        if (imp.node.exposing) {
          for (const exposed of imp.node.exposing) {
            if (exposed.name === oldName) {
              otherEdits.push({
                range: {
                  start: { line: exposed.span.start.line, character: exposed.span.start.column },
                  end: { line: exposed.span.end.line, character: exposed.span.end.column },
                },
                newText: newName,
              });
            }
          }
        }

        if (otherEdits.length > 0) {
          changes[otherUri] = (changes[otherUri] ?? []).concat(otherEdits);
        }
      }
    }
  }

  if (Object.values(changes).every(e => e.length === 0)) return null;
  return { changes };
}

function collectWholeWordEdits(text: string, oldName: string, newName: string): TextEdit[] {
  const edits: TextEdit[] = [];
  const regex = new RegExp(`\\b${escapeRegex(oldName)}\\b`, 'g');
  const lines = text.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
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
  return edits;
}

function safeReadFile(absPath: string): string | null {
  try {
    // Lazy import to avoid top-level fs in the LSP bundle eager path.
    return require('fs').readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
}

function fsPathToUri(fsPath: string): string {
  const absolute = path.resolve(fsPath);
  if (/^[a-zA-Z]:/.test(absolute)) {
    return 'file:///' + absolute.replace(/\\/g, '/');
  }
  return 'file://' + absolute;
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
