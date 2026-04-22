import type { Position, Location } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SymbolTable, ProjectSymbolTable } from '@gist-lang/workspace';
import * as fs from 'fs';
import * as path from 'path';
import { getQualifiedRefAtPosition } from './definition.js';

/**
 * Find all references to a symbol at the given position.
 * When a ProjectSymbolTable is provided, references in importing files
 * (qualified `alias.Name` uses and `exposing` list entries) are included too.
 */
export function computeReferences(
  document: TextDocument,
  position: Position,
  symbols: SymbolTable | undefined,
  includeDeclaration: boolean,
  project?: ProjectSymbolTable,
  documents?: (uri: string) => TextDocument | undefined,
): Location[] {
  // If the cursor is on a qualified `alias.Name`, delegate to the source
  // declaration's find-refs so the result is symmetric with invoking on
  // the declaration itself.
  const qualified = getQualifiedRefAtPosition(document, position);
  if (qualified && project) {
    const resolved = project.resolveTypeName({ alias: qualified.alias, name: qualified.name });
    if (resolved) {
      return findReferencesForSymbol(
        qualified.name,
        resolved.sourceFile,
        project,
        documents,
        includeDeclaration,
      );
    }
  }

  if (!symbols) return [];

  const word = getWordAtPosition(document, position);
  if (!word) return [];

  // Local path (file-scoped) — always run.
  const locations = collectLocalReferences(document, symbols, word, includeDeclaration);

  // Cross-file walk when we have a project table.
  if (project) {
    locations.push(...collectCrossFileReferences(word, project, documents));
  }

  return dedupeLocations(locations);
}

/**
 * Drop duplicate locations. A reference site can be picked up by more than
 * one collection strategy (e.g. the declaration span from the symbol table
 * plus the same span from a whole-word text scan), and duplicates are
 * user-visible noise in "Find All References".
 */
function dedupeLocations(locations: Location[]): Location[] {
  const seen = new Set<string>();
  const out: Location[] = [];
  for (const loc of locations) {
    const key = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}-${loc.range.end.line}:${loc.range.end.character}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}

/** Find references to a symbol when we already know its source file (for qualified-ref navigation). */
function findReferencesForSymbol(
  name: string,
  sourceFile: string,
  project: ProjectSymbolTable,
  documents: ((uri: string) => TextDocument | undefined) | undefined,
  includeDeclaration: boolean,
): Location[] {
  const sourceSymbols = project.graph.symbols.get(sourceFile);
  if (!sourceSymbols) return [];

  const sourceUri = fsPathToUri(sourceFile);
  const sourceText = readDocText(sourceUri, sourceFile, documents);
  const sourceDoc = documents?.(sourceUri);

  const locations: Location[] = [];

  if (includeDeclaration) {
    for (const info of sourceSymbols.getSymbols(name)) {
      locations.push({
        uri: sourceUri,
        range: {
          start: { line: info.span.start.line, character: info.span.start.column },
          end: { line: info.span.end.line, character: info.span.end.column },
        },
      });
    }
  }

  // Local refs inside the source file.
  if (sourceText !== null) {
    locations.push(...collectWholeWordLocations(sourceUri, sourceText, name));
  } else if (sourceDoc) {
    locations.push(...collectWholeWordLocations(sourceUri, sourceDoc.getText(), name));
  }

  locations.push(...collectCrossFileReferences(name, projectAtSource(project, sourceFile), documents));

  return dedupeLocations(locations);
}

/** Build a view of the project table rooted at a different file (for cross-file walks). */
function projectAtSource(project: ProjectSymbolTable, sourceFile: string): ProjectSymbolTable {
  const sourceSymbols = project.graph.symbols.get(sourceFile);
  if (!sourceSymbols) return project;
  // We only read `graph.byFile` and `currentFile` in the cross-file walk, so a
  // lightweight shim with the same graph is enough.
  return {
    ...project,
    currentFile: sourceFile,
    local: sourceSymbols,
    graph: project.graph,
    getImport: project.getImport.bind(project),
    resolveTypeName: project.resolveTypeName.bind(project),
    isExportedFromSibling: project.isExportedFromSibling.bind(project),
    getResolvedFields: project.getResolvedFields.bind(project),
    listAliasMembers: project.listAliasMembers.bind(project),
  } as ProjectSymbolTable;
}

function collectLocalReferences(
  document: TextDocument,
  symbols: SymbolTable,
  word: string,
  includeDeclaration: boolean,
): Location[] {
  const locations: Location[] = [];

  if (includeDeclaration) {
    for (const info of symbols.getSymbols(word)) {
      locations.push({
        uri: document.uri,
        range: {
          start: { line: info.span.start.line, character: info.span.start.column },
          end: { line: info.span.end.line, character: info.span.end.column },
        },
      });
    }
  }

  for (const ref of symbols.getReferences(word)) {
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

/**
 * Walk every file in the workspace that imports `project.currentFile` and
 * collect:
 * - `alias.word` qualified references (name portion only)
 * - `exposing` list entries that match `word`
 */
function collectCrossFileReferences(
  word: string,
  project: ProjectSymbolTable,
  documents: ((uri: string) => TextDocument | undefined) | undefined,
): Location[] {
  const locations: Location[] = [];
  const currentFile = project.currentFile;

  for (const [otherPath, otherImports] of project.graph.byFile) {
    if (otherPath === currentFile) continue;

    for (const imp of otherImports.values()) {
      if (imp.targetPath !== currentFile) continue;
      const alias = imp.aliasName;

      const otherUri = fsPathToUri(otherPath);
      const text = readDocText(otherUri, otherPath, documents);
      if (text === null) continue;

      // 1. Qualified references: `alias.word`.
      const regex = new RegExp(
        `\\b${escapeRegex(alias)}\\.${escapeRegex(word)}\\b`,
        'g',
      );
      const lines = text.split('\n');
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
          const nameStart = match.index + alias.length + 1;
          locations.push({
            uri: otherUri,
            range: {
              start: { line: lineNum, character: nameStart },
              end: { line: lineNum, character: nameStart + word.length },
            },
          });
        }
      }

      // 2. Exposing-list entries whose name matches.
      if (imp.node.exposing) {
        for (const exposed of imp.node.exposing) {
          if (exposed.name === word) {
            locations.push({
              uri: otherUri,
              range: {
                start: { line: exposed.span.start.line, character: exposed.span.start.column },
                end: { line: exposed.span.end.line, character: exposed.span.end.column },
              },
            });
          }
        }
      }
    }
  }

  return locations;
}

function collectWholeWordLocations(uri: string, text: string, word: string): Location[] {
  const locations: Location[] = [];
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
  const lines = text.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      // Skip occurrences that are part of a qualified reference — those get
      // picked up by the dedicated qualified-reference walk.
      if (line[match.index - 1] === '.') continue;
      locations.push({
        uri,
        range: {
          start: { line: lineNum, character: match.index },
          end: { line: lineNum, character: match.index + word.length },
        },
      });
    }
  }
  return locations;
}

function readDocText(
  uri: string,
  fsPath: string,
  documents: ((uri: string) => TextDocument | undefined) | undefined,
): string | null {
  const doc = documents?.(uri);
  if (doc) return doc.getText();
  try {
    return fs.readFileSync(fsPath, 'utf-8');
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fsPathToUri(fsPath: string): string {
  const absolute = path.resolve(fsPath);
  if (/^[a-zA-Z]:/.test(absolute)) {
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
