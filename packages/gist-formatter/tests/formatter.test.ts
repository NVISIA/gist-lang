import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { format } from '../src/formatter.js';

// ─── Basic formatting ──────────────────────────────────────

describe('format', () => {
  it('removes trailing whitespace', () => {
    const input = 'Foo = {   \n  name: string   \n}  \n';
    const result = format(input);
    for (const line of result.split('\n')) {
      // every non-empty line should have no trailing spaces
      if (line.length > 0) {
        expect(line).toBe(line.trimEnd());
      }
    }
  });

  it('ensures trailing newline', () => {
    const input = 'Foo = {\n  name: string\n}';
    const result = format(input);
    expect(result.endsWith('\n')).toBe(true);
  });

  it('can disable trailing newline', () => {
    const input = 'Foo = {\n  name: string\n}\n';
    const result = format(input, { trailingNewline: false });
    expect(result.endsWith('\n')).toBe(false);
  });

  it('collapses multiple consecutive blank lines to one', () => {
    const input = 'Foo = {\n  name: string\n}\n\n\n\nBar = {\n  id: int\n}\n';
    const result = format(input);
    // Should not have more than one consecutive blank line
    expect(result).not.toContain('\n\n\n');
    // But should preserve one blank line between declarations
    expect(result).toContain('\n\n');
  });

  it('normalizes indentation to 2-space multiples', () => {
    const input = 'Foo = {\n   name: string\n     age: int\n}\n';
    const result = format(input);
    // 3 spaces → 2 (nearest 2-space multiple), 5 spaces → 4 or 6
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.length > 0) {
        const indent = line.length - line.trimStart().length;
        expect(indent % 2).toBe(0);
      }
    }
  });

  it('normalizes spacing around colons', () => {
    const input = 'Foo = {\n  name :string\n  age:  int\n}\n';
    const result = format(input);
    expect(result).toContain('name: string');
    expect(result).toContain('age: int');
  });

  it('normalizes spacing around equals', () => {
    const input = 'Foo={\n  name: string\n}\n';
    const result = format(input);
    expect(result).toContain('Foo = {');
  });

  it('normalizes spacing around arrows', () => {
    const input = '  to get(id: string)->Foo\n';
    const result = format(input);
    expect(result).toContain('-> Foo');
  });

  it('normalizes spacing around pipes', () => {
    const input = 'Status = active|inactive|pending\n';
    const result = format(input);
    expect(result).toContain('active | inactive | pending');
  });

  it('normalizes comma spacing', () => {
    const input = '  to create(name: string,age: int ,email:  string)\n';
    const result = format(input);
    expect(result).toContain('name: string, age: int, email: string');
  });

  it('inserts blank line between top-level declarations', () => {
    const input = 'Foo = {\n  name: string\n}\nBar = {\n  id: int\n}\n';
    const result = format(input);
    expect(result).toContain('}\n\nBar');
  });

  it('preserves comments unchanged', () => {
    const input = '// ─── Models ────────────────────────────────────────────\n\nFoo = {\n  name: string  // inline\n}\n';
    const result = format(input);
    expect(result).toContain('// ─── Models');
  });

  it('preserves prose content in do: blocks', () => {
    const input = [
      'module auth',
      '  to login(email: string, password: string)',
      '    do:',
      '      validate email format',
      '      check password against hash',
      '      generate session token',
      '',
    ].join('\n');
    const result = format(input);
    // Prose lines at indent >= 6 should be preserved
    expect(result).toContain('validate email format');
    expect(result).toContain('check password against hash');
  });

  it('collapses multiple internal spaces', () => {
    const input = '  name:   string\n';
    const result = format(input);
    expect(result).toContain('name: string');
    expect(result).not.toContain('  string');
  });

  it('handles empty input', () => {
    expect(format('')).toBe('');
    expect(format('\n\n\n')).toBe('');
  });

  it('handles single-line input', () => {
    const result = format('Foo = bar');
    expect(result).toBe('Foo = bar\n');
  });

  it('respects custom indent width', () => {
    const input = 'Foo = {\n    name: string\n}\n';
    const result = format(input, { indentWidth: 4 });
    const lines = result.split('\n');
    // "    name: string" → indent should be multiple of 4
    const indent = lines[1].length - lines[1].trimStart().length;
    expect(indent % 4).toBe(0);
  });
});

// ─── Idempotency ───────────────────────────────────────────

describe('idempotency', () => {
  it('formatting already-formatted output produces no changes', () => {
    const input = [
      'project bookmarks',
      '  > Save URLs, tag them, search later.',
      '  stack: gist.yaml',
      '',
      'Tag = { id: string, generated; name: string, unique }',
      '',
      'Bookmark = {',
      '  id: string, generated',
      '  url: string',
      '  title: string',
      '  tags: -> Tag[]',
      '}',
      '',
      'module bookmarks',
      '',
      '  to create(url: string, title: string) -> Bookmark',
      '    route: POST /bookmarks',
      '    saves: Bookmark, Tag',
      '    do:',
      '      validate URL format',
      '      create bookmark with tags',
      '',
      '  to list(tag?: string) -> Bookmark[]',
      '    route: GET /bookmarks',
      '    public',
      '    do:',
      '      filter bookmarks by tag if provided',
      '',
    ].join('\n');

    const first = format(input);
    const second = format(first);
    expect(second).toBe(first);
  });

  it('double-formatting unformatted input is idempotent', () => {
    const messy = [
      'Foo={',
      '   name:string',
      '   age :  int',
      '}',
      '',
      '',
      '',
      'Bar ={',
      '  id:string',
      '}',
      '',
      'module  stuff',
      '  to create(a:string,b:int)->Foo|NotFound',
      '    saves:Foo',
      '    do:',
      '      validate inputs',
      '      create foo',
      '',
    ].join('\n');

    const first = format(messy);
    const second = format(first);
    expect(second).toBe(first);
  });
});

// ─── Real example files ───────────────────────────────────

describe('example files', () => {
  const examplesDir = path.resolve(__dirname, '../../../examples');

  const exampleFiles = [
    'bookmarks/bookmarks.gist',
    'todo-app/todo.gist',
    'deployer/deployer.gist',
  ];

  for (const relPath of exampleFiles) {
    const filePath = path.join(examplesDir, relPath);

    it(`formats ${relPath} without errors`, () => {
      if (!fs.existsSync(filePath)) return; // skip if not present
      const source = fs.readFileSync(filePath, 'utf-8');
      const formatted = format(source);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it(`${relPath} formatting is idempotent`, () => {
      if (!fs.existsSync(filePath)) return;
      const source = fs.readFileSync(filePath, 'utf-8');
      const first = format(source);
      const second = format(first);
      expect(second).toBe(first);
    });
  }
});

describe('format: cross-file imports', () => {
  it('round-trips use … as alias exposing A, B', () => {
    const source = 'use "./shared.gist" as shared exposing User, Session, Auditable\n';
    const formatted = format(source);
    expect(formatted).toContain('use "./shared.gist" as shared exposing User, Session, Auditable');
  });

  it('round-trips qualified type ref in field position', () => {
    const source = 'Task = {\n  owner: shared.User\n}\n';
    const formatted = format(source);
    expect(formatted).toContain('owner: shared.User');
  });

  it('round-trips qualified spread', () => {
    const source = 'Admin = {\n  ...shared.User\n  role: string\n}\n';
    const formatted = format(source);
    expect(formatted).toContain('...shared.User');
  });
});
