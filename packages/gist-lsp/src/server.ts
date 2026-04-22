import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DiagnosticSeverity as LspDiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  type Diagnostic as LspDiagnostic,
  type DidChangeWatchedFilesRegistrationOptions,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { lex, parse, cstToAst, DiagnosticSeverity } from '@gist-lang/parser';
import type { Diagnostic, GistProgram } from '@gist-lang/parser';
import {
  discoverWorkspace,
  parseGistYaml,
  loadAllKits,
  KitRegistry,
  SymbolTable,
  buildImportGraph,
  updateFileInGraph,
  removeFileFromGraph,
  ProjectSymbolTable,
} from '@gist-lang/workspace';
import type { GistProjectConfig, WorkspaceInfo, FileEntry, ImportGraph } from '@gist-lang/workspace';
import { computeSemanticDiagnostics } from './features/diagnostics.js';
import { computeCompletions } from './features/completion.js';
import { computeHover } from './features/hover.js';
import { computeSemanticTokens, SEMANTIC_TOKENS_LEGEND } from './features/semantic-tokens.js';
import { computeDefinition } from './features/definition.js';
import { computeReferences } from './features/references.js';
import { prepareRename, computeRename } from './features/rename.js';
import { computeCodeActions } from './features/code-actions.js';
import { computeWorkspaceSymbols } from './features/workspace-symbols.js';
import { format } from '@gist-lang/formatter';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

/** Kit registry shared across the workspace. */
const kitRegistry = new KitRegistry();

/** Cached workspace info. */
let workspaceInfo: WorkspaceInfo | undefined;

/** Cached project config from gist.yaml. */
let projectConfig: GistProjectConfig | null = null;

/** Cached ASTs per document URI. */
const astCache = new Map<string, GistProgram>();

/** Cached symbol tables per document URI. */
const symbolCache = new Map<string, SymbolTable>();

/** Cached file entries keyed by absolute filesystem path (for import resolution). */
const fileEntryCache = new Map<string, FileEntry>();

/** Cached per-document ProjectSymbolTable. */
const projectCache = new Map<string, ProjectSymbolTable>();

/** Persistent workspace-wide import graph. Updated incrementally on file change. */
let importGraph: ImportGraph | null = null;

/** Lazily load a workspace file from disk for import graph resolution. */
function lazyLoadFile(absPath: string): FileEntry | null {
  if (fileEntryCache.has(absPath)) return fileEntryCache.get(absPath)!;
  let source: string;
  try {
    source = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
  const kitKeywords = kitRegistry.getAllKeywords();
  const lexResult = lex(source, { kitKeywords: kitKeywords.size > 0 ? kitKeywords : undefined });
  const parseResult = parse(lexResult.tokens);
  const program = cstToAst(parseResult.cst);
  const symbols = SymbolTable.build(program, projectConfig);
  const entry: FileEntry = { path: absPath, program, symbols };
  fileEntryCache.set(absPath, entry);
  return entry;
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Discover workspace from the root folder
  const rootUri = params.rootUri ?? params.rootPath;
  if (rootUri) {
    const rootPath = uriToFsPath(rootUri);
    initWorkspace(rootPath);
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        triggerCharacters: [':', '.', ' '],
      },
      hoverProvider: true,
      semanticTokensProvider: {
        legend: SEMANTIC_TOKENS_LEGEND,
        full: true,
      },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      codeActionProvider: {
        codeActionKinds: ['quickfix'],
      },
      workspaceSymbolProvider: true,
      documentFormattingProvider: true,
    },
  };
});

/** Convert a file:// URI or plain path to a filesystem path. */
function uriToFsPath(uri: string): string {
  if (uri.startsWith('file:///')) {
    // file:///C%3A/foo → C:/foo  (Windows)
    // file:///home/user → /home/user (Unix)
    const decoded = decodeURIComponent(uri.slice(7));
    // On Windows, paths start with drive letter: C:/...
    // The URI has an extra leading / before the drive letter
    if (/^\/[a-zA-Z]:/.test(decoded)) {
      return decoded.slice(1).replace(/\//g, '\\');
    }
    return decoded;
  }
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.slice(7));
  }
  return uri;
}

/**
 * Initialize workspace: discover files, load gist.yaml, load kits.
 */
function initWorkspace(rootPath: string): void {
  workspaceInfo = discoverWorkspace(rootPath);

  // Parse gist.yaml if found
  if (workspaceInfo.gistYamlPath) {
    projectConfig = parseGistYaml(workspaceInfo.gistYamlPath);
  }

  // Load kits from discovered kit directories
  const kits = loadAllKits(workspaceInfo.kitDirs);
  kitRegistry.clear();
  for (const kit of kits) {
    kitRegistry.addKit(kit);
  }

  // Seed the persistent import graph with every .gist file on disk.
  const seedEntries: FileEntry[] = [];
  for (const p of workspaceInfo.gistFiles) {
    const abs = path.resolve(p);
    const entry = lazyLoadFile(abs);
    if (entry) seedEntries.push(entry);
  }
  importGraph = buildImportGraph(seedEntries, lazyLoadFile);

  connection.console.log(
    `GIST workspace: ${workspaceInfo.gistFiles.length} .gist files, ` +
    `${kitRegistry.getLoadedKitNames().length} kits loaded ` +
    `(${[...kitRegistry.getAllKeywords()].join(', ')})`
  );
}

// After init, register a dynamic file watcher for `.gist` files so the server
// sees new/deleted/externally-modified files without a restart. `gist.yaml`
// and `kits/**` changes still require restart — tracked in ROADMAP.md.
connection.onInitialized(() => {
  const options: DidChangeWatchedFilesRegistrationOptions = {
    watchers: [{ globPattern: '**/*.gist' }],
  };
  connection.client.register(DidChangeWatchedFilesNotification.type, options).catch(err => {
    connection.console.warn(`Failed to register .gist file watcher: ${err}`);
  });
});

// Re-validate on change
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

connection.onDidChangeWatchedFiles((params) => {
  if (!importGraph) return;

  for (const change of params.changes) {
    const absPath = uriToFsPath(change.uri);

    if (change.type === FileChangeType.Deleted) {
      fileEntryCache.delete(absPath);
      removeFileFromGraph(importGraph, absPath);
      astCache.delete(change.uri);
      symbolCache.delete(change.uri);
      projectCache.delete(change.uri);
      continue;
    }

    // Created or Changed: invalidate + re-read from disk, update graph.
    fileEntryCache.delete(absPath);
    const entry = lazyLoadFile(absPath);
    if (entry) {
      updateFileInGraph(importGraph, entry, lazyLoadFile);
    }
  }

  // Cross-file resolution may now produce different diagnostics for any open
  // document. Re-validate every one.
  for (const doc of documents.all()) {
    validateDocument(doc);
  }
});

function validateDocument(document: TextDocument): void {
  const source = document.getText();
  const kitKeywords = kitRegistry.getAllKeywords();

  // Phase 1: Lex
  const lexResult = lex(source, { kitKeywords: kitKeywords.size > 0 ? kitKeywords : undefined });
  const allDiagnostics: Diagnostic[] = [...lexResult.diagnostics];

  // Phase 2: Parse
  const parseResult = parse(lexResult.tokens);
  allDiagnostics.push(...parseResult.diagnostics);

  // Phase 3: CST → AST
  const ast = cstToAst(parseResult.cst);
  astCache.set(document.uri, ast);

  // Per-file SymbolTable
  const symbols = SymbolTable.build(ast, projectConfig);
  symbolCache.set(document.uri, symbols);

  // Update the file entry cache with the current in-memory version so
  // import resolution sees unsaved edits.
  const fsPath = uriToFsPath(document.uri);
  const entry: FileEntry = { path: fsPath, program: ast, symbols };
  fileEntryCache.set(fsPath, entry);

  // Incrementally update the persistent import graph: only the changed file's
  // own entries are rewritten; other files' resolutions look up `graph.symbols`
  // at query time, so they pick up the new state automatically.
  if (!importGraph) {
    importGraph = buildImportGraph([entry], lazyLoadFile);
  } else {
    updateFileInGraph(importGraph, entry, lazyLoadFile);
  }
  const project = new ProjectSymbolTable(importGraph, fsPath, symbols);
  projectCache.set(document.uri, project);

  // Phase 4: Semantic analysis (with cross-file resolution)
  const hasKits = kitRegistry.getLoadedKitNames().length > 0;
  const semantic = computeSemanticDiagnostics(
    ast,
    projectConfig,
    hasKits ? kitRegistry : null,
    project,
  );
  allDiagnostics.push(...semantic.diagnostics);

  const lspDiagnostics: LspDiagnostic[] = allDiagnostics.map(convertDiagnostic);
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: lspDiagnostics,
  });
}

function convertDiagnostic(diag: Diagnostic): LspDiagnostic {
  return {
    severity: diag.severity === DiagnosticSeverity.Error
      ? LspDiagnosticSeverity.Error
      : diag.severity === DiagnosticSeverity.Warning
        ? LspDiagnosticSeverity.Warning
        : LspDiagnosticSeverity.Information,
    range: {
      start: { line: diag.span.start.line, character: diag.span.start.column },
      end: { line: diag.span.end.line, character: diag.span.end.column },
    },
    message: diag.message,
    source: 'gist',
  };
}

// ─── Completion ─────────────────────────────────────────────

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  const symbols = symbolCache.get(params.textDocument.uri);
  const project = projectCache.get(params.textDocument.uri);
  return computeCompletions(
    document,
    params.position,
    symbols,
    kitRegistry.getLoadedKitNames().length > 0 ? kitRegistry : null,
    projectConfig,
    project,
  );
});

// ─── Hover ──────────────────────────────────────────────────

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const symbols = symbolCache.get(params.textDocument.uri);
  const project = projectCache.get(params.textDocument.uri);
  return computeHover(
    document,
    params.position,
    symbols,
    kitRegistry.getLoadedKitNames().length > 0 ? kitRegistry : null,
    project,
  );
});

// ─── Semantic Tokens ────────────────────────────────────────

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return { data: [] };
  return computeSemanticTokens(
    document,
    kitRegistry.getLoadedKitNames().length > 0 ? kitRegistry : null,
  );
});

// ─── Go to Definition ───────────────────────────────────────

connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const symbols = symbolCache.get(params.textDocument.uri);
  const project = projectCache.get(params.textDocument.uri);
  return computeDefinition(document, params.position, symbols, project);
});

// ─── Find References ────────────────────────────────────────

connection.onReferences((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  const symbols = symbolCache.get(params.textDocument.uri);
  const project = projectCache.get(params.textDocument.uri);
  return computeReferences(
    document,
    params.position,
    symbols,
    params.context.includeDeclaration,
    project,
    uri => documents.get(uri),
  );
});

// ─── Rename ─────────────────────────────────────────────────

connection.onPrepareRename((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const symbols = symbolCache.get(params.textDocument.uri);
  return prepareRename(document, params.position, symbols);
});

connection.onRenameRequest((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const symbols = symbolCache.get(params.textDocument.uri);
  const project = projectCache.get(params.textDocument.uri);
  return computeRename(
    document,
    params.position,
    params.newName,
    symbols,
    project,
    uri => documents.get(uri),
  );
});

// ─── Code Actions ───────────────────────────────────────────

connection.onCodeAction((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  const symbols = symbolCache.get(params.textDocument.uri);
  const project = projectCache.get(params.textDocument.uri);
  return computeCodeActions(document, params, symbols, project);
});

// ─── Workspace Symbols ──────────────────────────────────────

connection.onWorkspaceSymbol((params) => {
  return computeWorkspaceSymbols(params.query, symbolCache);
});

// ─── Document Formatting ─────────────────────────────────

connection.onDocumentFormatting((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const source = document.getText();
  const formatted = format(source, {
    indentWidth: params.options.tabSize ?? 2,
  });

  // If nothing changed, return no edits
  if (source === formatted) return [];

  // Replace the entire document
  const lastLine = document.lineCount - 1;
  const lastChar = document.getText().length;
  return [{
    range: {
      start: { line: 0, character: 0 },
      end: document.positionAt(lastChar),
    },
    newText: formatted,
  }];
});

documents.listen(connection);
connection.listen();
