import { describe, it, expect } from 'vitest';
import { lex, parse, cstToAst, DiagnosticSeverity } from '@gist-lang/parser';
import type { GistProgram } from '@gist-lang/parser';
import {
  SymbolTable,
  buildImportGraph,
  ProjectSymbolTable,
  runAllValidators,
  removeFileFromGraph,
} from '@gist-lang/workspace';
import type { FileEntry } from '@gist-lang/workspace';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { computeReferences } from '../src/features/references.js';
import { computeHover } from '../src/features/hover.js';

function parseToAst(source: string): GistProgram {
  const { tokens } = lex(source);
  const { cst } = parse(tokens);
  return cstToAst(cst);
}

function makeEntry(absPath: string, source: string): FileEntry {
  const program = parseToAst(source);
  const symbols = SymbolTable.build(program);
  return { path: absPath, program, symbols };
}

function runCrossFile(
  entries: FileEntry[],
  currentFile: string,
) {
  const graph = buildImportGraph(entries, () => null);
  const entry = entries.find(e => e.path === currentFile)!;
  const project = new ProjectSymbolTable(graph, currentFile, entry.symbols);
  const diagnostics = runAllValidators(
    entry.program,
    entry.symbols,
    null,
    [],
    project,
  );
  return { graph, project, diagnostics };
}

describe('Cross-file imports: resolution', () => {
  it('resolves qualified spread across files', () => {
    const shared = makeEntry('/ws/shared.gist', `
trait Auditable {
  created_at: datetime
  updated_at: datetime
}
User = {
  id: string, unique
  email: string
  ...Auditable
}
`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as shared exposing User, Auditable

Task = {
  id: string, unique
  owner: shared.User
  ...shared.Auditable
}
`);

    const { diagnostics } = runCrossFile([shared, app], '/ws/app.gist');
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(errors).toHaveLength(0);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
    // No "Undeclared type" or "not a declared trait" warnings
    expect(warnings.some(w => w.message.includes('Undeclared'))).toBe(false);
    expect(warnings.some(w => w.message.includes('not a declared trait'))).toBe(false);
  });

  it('allows local model spread ("inheritance")', () => {
    const ast = parseToAst(`
User = {
  id: string
  email: string
}
Admin = {
  ...User
  role: string
}
`);
    const symbols = SymbolTable.build(ast);
    const diagnostics = runAllValidators(ast, symbols, null, []);
    const spreadWarnings = diagnostics.filter(d => d.message.includes('spreads'));
    expect(spreadWarnings).toHaveLength(0);
  });

  it('warns when qualified reference resolves to an unexposed symbol', () => {
    const shared = makeEntry('/ws/shared.gist', `
User = { id: string }
Session = { token: string }
`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as shared exposing User

// Session exists in shared.gist but is NOT exposed
Blob = {
  s: shared.Session
}
`);
    const { diagnostics } = runCrossFile([shared, app], '/ws/app.gist');
    expect(diagnostics.some(d =>
      d.severity === DiagnosticSeverity.Warning &&
      d.message.includes("Unresolved reference 'shared.Session'"),
    )).toBe(true);
  });

  it('warns when use path cannot be resolved', () => {
    const app = makeEntry('/ws/app.gist', `
use "./missing.gist" as missing
`);
    const { diagnostics } = runCrossFile([app], '/ws/app.gist');
    expect(diagnostics.some(d =>
      d.severity === DiagnosticSeverity.Warning &&
      d.message.includes('Cannot resolve import path'),
    )).toBe(true);
  });

  it('warns on alias collision within a single file', () => {
    const shared = makeEntry('/ws/shared.gist', `X = { a: string }`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as shared
use "./shared.gist" as shared
`);
    const { diagnostics } = runCrossFile([shared, app], '/ws/app.gist');
    expect(diagnostics.some(d =>
      d.severity === DiagnosticSeverity.Warning &&
      d.message.includes("Alias 'shared' is already used"),
    )).toBe(true);
  });

  it('warns when an exposed name is not declared in the target file', () => {
    const shared = makeEntry('/ws/shared.gist', `User = { id: string }`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as shared exposing User, GhostModel
`);
    const { diagnostics } = runCrossFile([shared, app], '/ws/app.gist');
    expect(diagnostics.some(d =>
      d.severity === DiagnosticSeverity.Warning &&
      d.message.includes("'GhostModel' is not declared"),
    )).toBe(true);
  });

  it('detects and warns about import cycles', () => {
    const a = makeEntry('/ws/a.gist', `use "./b.gist" as b`);
    const b = makeEntry('/ws/b.gist', `use "./a.gist" as a`);
    const { diagnostics } = runCrossFile([a, b], '/ws/a.gist');
    expect(diagnostics.some(d => d.message.includes('Import cycle'))).toBe(true);
  });

  it('wildcard expose (no exposing clause) sees all top-level symbols', () => {
    const shared = makeEntry('/ws/shared.gist', `
User = { id: string }
Session = { token: string }
`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as shared

Link = {
  u: shared.User
  s: shared.Session
}
`);
    const { diagnostics } = runCrossFile([shared, app], '/ws/app.gist');
    const unresolved = diagnostics.filter(d => d.message.includes('Unresolved'));
    expect(unresolved).toHaveLength(0);
  });
});

describe('Cross-file imports: ProjectSymbolTable', () => {
  it('resolveTypeName returns local decl when unqualified', () => {
    const a = makeEntry('/ws/a.gist', `User = { id: string }`);
    const graph = buildImportGraph([a], () => null);
    const project = new ProjectSymbolTable(graph, '/ws/a.gist', a.symbols);
    const resolved = project.resolveTypeName({ name: 'User' });
    expect(resolved).not.toBeNull();
    expect(resolved!.kind).toBe('model');
    expect(resolved!.sourceFile).toBe('/ws/a.gist');
  });

  it('resolveTypeName follows alias to sibling file', () => {
    const shared = makeEntry('/ws/shared.gist', `User = { id: string }`);
    const app = makeEntry('/ws/app.gist', `use "./shared.gist" as shared`);
    const graph = buildImportGraph([shared, app], () => null);
    const project = new ProjectSymbolTable(graph, '/ws/app.gist', app.symbols);
    const resolved = project.resolveTypeName({ alias: 'shared', name: 'User' });
    expect(resolved).not.toBeNull();
    expect(resolved!.sourceFile).toBe('/ws/shared.gist');
    expect(resolved!.alias).toBe('shared');
  });

  it('getResolvedFields flattens cross-file trait spread', () => {
    const shared = makeEntry('/ws/shared.gist', `
trait Auditable {
  created_at: datetime
  updated_at: datetime
}
`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as shared exposing Auditable

Task = {
  id: string
  ...shared.Auditable
}
`);
    const graph = buildImportGraph([shared, app], () => null);
    const project = new ProjectSymbolTable(graph, '/ws/app.gist', app.symbols);
    const fields = project.getResolvedFields('Task');
    const names = fields.map(f => f.name).sort();
    expect(names).toEqual(['created_at', 'id', 'updated_at']);
  });

  it('isExportedFromSibling finds bare name in a sibling file', () => {
    const shared = makeEntry('/ws/shared.gist', `User = { id: string }`);
    const app = makeEntry('/ws/app.gist', ``);
    const graph = buildImportGraph([shared, app], () => null);
    const project = new ProjectSymbolTable(graph, '/ws/app.gist', app.symbols);
    const hit = project.isExportedFromSibling('User');
    expect(hit).not.toBeNull();
    expect(hit!.sourceFile).toBe('/ws/shared.gist');
  });

  it('listAliasMembers honors exposing gate', () => {
    const shared = makeEntry('/ws/shared.gist', `
User = { id: string }
Session = { token: string }
Secret = { v: string }
`);
    const app = makeEntry('/ws/app.gist', `use "./shared.gist" as shared exposing User, Session`);
    const graph = buildImportGraph([shared, app], () => null);
    const project = new ProjectSymbolTable(graph, '/ws/app.gist', app.symbols);
    const members = project.listAliasMembers('shared').sort();
    expect(members).toEqual(['Session', 'User']);
    expect(members).not.toContain('Secret');
  });
});

describe('Cross-file imports: diagnostics edge cases', () => {
  it('warns when the same name appears twice in an exposing list', () => {
    const shared = makeEntry('/ws/shared.gist', `User = { id: string }`);
    const app = makeEntry('/ws/app.gist', `use "./shared.gist" as shared exposing User, User`);
    const { diagnostics } = runCrossFile([shared, app], '/ws/app.gist');
    expect(diagnostics.some(d =>
      d.severity === DiagnosticSeverity.Warning &&
      d.message.includes('appears more than once'),
    )).toBe(true);
  });
});

describe('Cross-file find references', () => {
  const shared = makeEntry('/ws/shared.gist', `
User = { id: string }
`);
  const appSource = `use "./shared.gist" as shared exposing User

Task = {
  owner: shared.User
}

Admin = {
  ...shared.User
  role: string
}
`;
  const app = makeEntry('/ws/app.gist', appSource);

  function makeProject(current: string) {
    const graph = buildImportGraph([shared, app], () => null);
    const entry = current === shared.path ? shared : app;
    return new ProjectSymbolTable(graph, current, entry.symbols);
  }

  function mkDoc(uri: string, text: string) {
    return TextDocument.create(uri, 'gist', 1, text);
  }

  it('find-refs on declaration includes qualified refs in importers', () => {
    const project = makeProject(shared.path);
    const sharedDoc = mkDoc('file:///ws/shared.gist', 'User = { id: string }\n');
    const appDoc = mkDoc('file:///ws/app.gist', appSource);
    const documentsByUri = (uri: string) => {
      if (uri === 'file:///ws/shared.gist') return sharedDoc;
      if (uri === 'file:///ws/app.gist') return appDoc;
      return undefined;
    };

    // Cursor on `User` at column 0 of shared.gist.
    const locs = computeReferences(
      sharedDoc,
      { line: 0, character: 0 },
      shared.symbols,
      true,
      project,
      documentsByUri,
    );

    const appLocs = locs.filter(l => l.uri === 'file:///ws/app.gist');
    // Expect: one qualified hit for `shared.User` on the owner line, one for
    // the spread, and one for the `exposing User` entry.
    expect(appLocs.length).toBeGreaterThanOrEqual(3);
  });

  it('find-refs on a qualified alias.Name delegates to the source decl', () => {
    const project = makeProject(app.path);
    const sharedDoc = mkDoc('file:///ws/shared.gist', 'User = { id: string }\n');
    const appDoc = mkDoc('file:///ws/app.gist', appSource);
    const documentsByUri = (uri: string) => {
      if (uri === 'file:///ws/shared.gist') return sharedDoc;
      if (uri === 'file:///ws/app.gist') return appDoc;
      return undefined;
    };

    // Cursor on the `User` portion of `shared.User` on line 3 ("  owner: shared.User").
    const line = appSource.split('\n')[3]!;
    const col = line.indexOf('User');

    const locs = computeReferences(
      appDoc,
      { line: 3, character: col + 1 },
      app.symbols,
      true,
      project,
      documentsByUri,
    );

    // Should include the shared.gist decl and the uses in app.gist.
    expect(locs.some(l => l.uri === 'file:///ws/shared.gist')).toBe(true);
    expect(locs.some(l => l.uri === 'file:///ws/app.gist')).toBe(true);
  });
});

describe('removeFileFromGraph', () => {
  it('clears programs/symbols/byFile/diagnostics for the removed file', () => {
    const a = makeEntry('/ws/a.gist', 'use "./b.gist" as b');
    const b = makeEntry('/ws/b.gist', 'X = { id: string }');
    const graph = buildImportGraph([a, b], () => null);
    expect(graph.programs.has('/ws/b.gist')).toBe(true);

    removeFileFromGraph(graph, '/ws/b.gist');

    expect(graph.programs.has('/ws/b.gist')).toBe(false);
    expect(graph.symbols.has('/ws/b.gist')).toBe(false);
    expect(graph.byFile.has('/ws/b.gist')).toBe(false);
    expect(graph.diagnostics.has('/ws/b.gist')).toBe(false);
  });
});

describe('extend / refine: hover surfacing', () => {
  it('lists extends targeting a local intent', () => {
    const app = makeEntry('/ws/app.gist', `
module tasks
  to create(title: string) -> string
    do: make a task

extend create
  also log an activity entry
`);
    const graph = buildImportGraph([app], () => null);
    const project = new ProjectSymbolTable(graph, app.path, app.symbols);
    const doc = TextDocument.create(
      'file:///ws/app.gist',
      'gist',
      1,
      app.program.span ? `${app}` : '',
    );
    // Place the cursor on `create` inside the module body.
    const intents = [...app.symbols.intents.values()];
    expect(intents).toHaveLength(1);

    const exts = project.getExtensionsFor('create', 'tasks');
    expect(exts).toHaveLength(1);
    expect(exts[0]!.kind).toBe('extend');
    expect(exts[0]!.body.join(' ')).toContain('log an activity entry');
  });

  it('includes cross-file refines via qualified targets', () => {
    const shared = makeEntry('/ws/shared.gist', `
module auth
  to login(email: string) -> string
    do: authenticate
`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as auth

refine auth.login
  add param: remember: bool = false
`);
    const graph = buildImportGraph([shared, app], () => null);
    const project = new ProjectSymbolTable(graph, shared.path, shared.symbols);
    const exts = project.getExtensionsFor('login', 'auth');
    expect(exts.some(e => e.kind === 'refine' && e.sourceFile === app.path)).toBe(true);
  });

  it('hover renders "Extended by" section when extensions exist', () => {
    const src = `module tasks
  to create(title: string) -> string
    do: make a task

extend create
  also log an activity entry
`;
    const app = makeEntry('/ws/app.gist', src);
    const graph = buildImportGraph([app], () => null);
    const project = new ProjectSymbolTable(graph, app.path, app.symbols);
    const doc = TextDocument.create('file:///ws/app.gist', 'gist', 1, src);

    // Cursor on `create` in `to create(...)`.
    const hover = computeHover(
      doc,
      { line: 1, character: 5 /* inside "create" */ },
      app.symbols,
      null,
      project,
    );

    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Extended by');
    expect(value).toContain('log an activity entry');
  });
});

describe('extend / refine: target validation', () => {
  it('warns when a local extend target does not exist', () => {
    const app = makeEntry('/ws/app.gist', `
extend missing_intent
  also log an event
`);
    const { diagnostics } = runCrossFile([app], '/ws/app.gist');
    expect(diagnostics.some(d =>
      d.severity === DiagnosticSeverity.Warning &&
      d.message.includes("'extend missing_intent' references an intent or fn that is not declared"),
    )).toBe(true);
  });

  it('accepts an extend target that names a local intent', () => {
    const app = makeEntry('/ws/app.gist', `
module tasks
  to create(title: string) -> string
    do: make a task

extend create
  also log an event
`);
    const { diagnostics } = runCrossFile([app], '/ws/app.gist');
    expect(diagnostics.some(d => d.message.includes('extend create'))).toBe(false);
  });

  it('warns when refine target is qualified but unresolvable', () => {
    const shared = makeEntry('/ws/shared.gist', `
module auth
  to login(email: string) -> string
    do: authenticate
`);
    const app = makeEntry('/ws/app.gist', `
use "./shared.gist" as auth

refine auth.nonexistent
  add param: priority: int = 0
`);
    const { diagnostics } = runCrossFile([shared, app], '/ws/app.gist');
    expect(diagnostics.some(d =>
      d.severity === DiagnosticSeverity.Warning &&
      d.message.includes("'refine auth.nonexistent'"),
    )).toBe(true);
  });
});
