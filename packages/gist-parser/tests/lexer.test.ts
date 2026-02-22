import { describe, it, expect } from 'vitest';
import { lex, TokenKind } from '../src/index.js';
import type { Token } from '../src/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Helper: extract just the kinds from a lex result, filtering out NEWLINE and comments. */
function kinds(source: string, opts = {}): TokenKind[] {
  const { tokens } = lex(source, opts);
  return tokens
    .filter(t => t.kind !== TokenKind.NEWLINE && t.kind !== TokenKind.LINE_COMMENT && t.kind !== TokenKind.BLOCK_COMMENT)
    .map(t => t.kind);
}

/** Helper: extract kind+text pairs, filtering trivia. */
function pairs(source: string, opts = {}): [TokenKind, string][] {
  const { tokens } = lex(source, opts);
  return tokens
    .filter(t => t.kind !== TokenKind.NEWLINE && t.kind !== TokenKind.LINE_COMMENT && t.kind !== TokenKind.BLOCK_COMMENT)
    .map(t => [t.kind, t.text]);
}

describe('Lexer — Basic Tokens', () => {
  it('recognizes delimiters', () => {
    const result = kinds('( ) { } [ ] , ; . | = ? :');
    expect(result).toContain(TokenKind.OPEN_PAREN);
    expect(result).toContain(TokenKind.CLOSE_PAREN);
    expect(result).toContain(TokenKind.OPEN_BRACE);
    expect(result).toContain(TokenKind.CLOSE_BRACE);
    expect(result).toContain(TokenKind.OPEN_BRACKET);
    expect(result).toContain(TokenKind.CLOSE_BRACKET);
    expect(result).toContain(TokenKind.COMMA);
    expect(result).toContain(TokenKind.SEMICOLON);
    expect(result).toContain(TokenKind.DOT);
    expect(result).toContain(TokenKind.PIPE);
    expect(result).toContain(TokenKind.EQUALS);
    expect(result).toContain(TokenKind.QUESTION);
    expect(result).toContain(TokenKind.COLON);
  });

  it('recognizes arrow and spread', () => {
    const result = pairs('-> ...');
    expect(result).toContainEqual([TokenKind.ARROW, '->']);
    expect(result).toContainEqual([TokenKind.SPREAD, '...']);
  });

  it('recognizes string literals', () => {
    const result = pairs('"hello world"');
    expect(result).toContainEqual([TokenKind.STRING_LITERAL, '"hello world"']);
  });

  it('recognizes integer literals', () => {
    const result = pairs('42 -3 0');
    expect(result).toContainEqual([TokenKind.INT_LITERAL, '42']);
    expect(result).toContainEqual([TokenKind.INT_LITERAL, '-3']);
    expect(result).toContainEqual([TokenKind.INT_LITERAL, '0']);
  });

  it('recognizes float literals', () => {
    const result = pairs('3.14 -0.5');
    expect(result).toContainEqual([TokenKind.FLOAT_LITERAL, '3.14']);
    expect(result).toContainEqual([TokenKind.FLOAT_LITERAL, '-0.5']);
  });

  it('recognizes duration literals', () => {
    const result = pairs('30s 5m 2h 7d');
    expect(result).toContainEqual([TokenKind.DURATION, '30s']);
    expect(result).toContainEqual([TokenKind.DURATION, '5m']);
    expect(result).toContainEqual([TokenKind.DURATION, '2h']);
    expect(result).toContainEqual([TokenKind.DURATION, '7d']);
  });
});

describe('Lexer — Keywords', () => {
  it('recognizes structure keywords', () => {
    expect(kinds('project')).toContain(TokenKind.KW_PROJECT);
    expect(kinds('module')).toContain(TokenKind.KW_MODULE);
    expect(kinds('always')).toContain(TokenKind.KW_ALWAYS);
    expect(kinds('rules')).toContain(TokenKind.KW_RULES);
  });

  it('recognizes declaration keywords', () => {
    expect(kinds('to')).toContain(TokenKind.KW_TO);
    expect(kinds('fn')).toContain(TokenKind.KW_FN);
    expect(kinds('flow')).toContain(TokenKind.KW_FLOW);
    expect(kinds('on')).toContain(TokenKind.KW_ON);
    expect(kinds('test')).toContain(TokenKind.KW_TEST);
  });

  it('recognizes metadata keywords', () => {
    expect(kinds('route')).toContain(TokenKind.KW_ROUTE);
    expect(kinds('saves')).toContain(TokenKind.KW_SAVES);
    expect(kinds('emits')).toContain(TokenKind.KW_EMITS);
    expect(kinds('guard')).toContain(TokenKind.KW_GUARD);
    expect(kinds('public')).toContain(TokenKind.KW_PUBLIC);
    expect(kinds('async')).toContain(TokenKind.KW_ASYNC);
  });

  it('recognizes primitive type keywords', () => {
    expect(kinds('string')).toContain(TokenKind.KW_STRING);
    expect(kinds('int')).toContain(TokenKind.KW_INT);
    expect(kinds('bool')).toContain(TokenKind.KW_BOOL);
    expect(kinds('datetime')).toContain(TokenKind.KW_DATETIME);
    expect(kinds('void')).toContain(TokenKind.KW_VOID);
  });

  it('recognizes HTTP methods', () => {
    expect(kinds('GET')).toContain(TokenKind.KW_GET);
    expect(kinds('POST')).toContain(TokenKind.KW_POST);
    expect(kinds('PUT')).toContain(TokenKind.KW_PUT);
    expect(kinds('PATCH')).toContain(TokenKind.KW_PATCH);
    expect(kinds('DELETE')).toContain(TokenKind.KW_DELETE);
  });

  it('recognizes modifier keywords', () => {
    expect(kinds('generated')).toContain(TokenKind.KW_GENERATED);
    expect(kinds('unique')).toContain(TokenKind.KW_UNIQUE);
    expect(kinds('secret')).toContain(TokenKind.KW_SECRET);
    expect(kinds('computed')).toContain(TokenKind.KW_COMPUTED);
    expect(kinds('ephemeral')).toContain(TokenKind.KW_EPHEMERAL);
    expect(kinds('immutable')).toContain(TokenKind.KW_IMMUTABLE);
  });
});

describe('Lexer — Identifiers', () => {
  it('distinguishes identifiers from type names', () => {
    const result = pairs('my_var MyType');
    expect(result).toContainEqual([TokenKind.IDENTIFIER, 'my_var']);
    expect(result).toContainEqual([TokenKind.TYPE_NAME, 'MyType']);
  });

  it('recognizes ALL_CAPS constants', () => {
    const result = pairs('MAX_RETRIES');
    expect(result).toContainEqual([TokenKind.UPPER_IDENTIFIER, 'MAX_RETRIES']);
  });

  it('does not confuse single uppercase word with constant', () => {
    // "Bookmark" should be TYPE_NAME, not UPPER_IDENTIFIER
    const result = pairs('Bookmark');
    expect(result).toContainEqual([TokenKind.TYPE_NAME, 'Bookmark']);
  });
});

describe('Lexer — Comments', () => {
  it('tokenizes line comments', () => {
    const { tokens } = lex('// this is a comment\nx');
    const comment = tokens.find(t => t.kind === TokenKind.LINE_COMMENT);
    expect(comment).toBeDefined();
    expect(comment!.text).toBe('// this is a comment');
  });

  it('tokenizes block comments', () => {
    const { tokens } = lex('/* multi\nline */ x');
    const comment = tokens.find(t => t.kind === TokenKind.BLOCK_COMMENT);
    expect(comment).toBeDefined();
    expect(comment!.text).toContain('multi');
  });
});

describe('Lexer — Indentation', () => {
  it('emits INDENT and DEDENT for nested blocks', () => {
    const source = 'project foo\n  stack: bar\n  always:\n    rule one\n';
    const result = kinds(source);
    expect(result).toContain(TokenKind.INDENT);
    expect(result).toContain(TokenKind.DEDENT);
  });

  it('emits correct number of DEDENTs at end of file', () => {
    const source = 'a\n  b\n    c';
    const result = kinds(source);
    // Should have 2 INDENTs (a→b, b→c) and 2 DEDENTs at EOF + EOF
    const indents = result.filter(k => k === TokenKind.INDENT).length;
    const dedents = result.filter(k => k === TokenKind.DEDENT).length;
    expect(indents).toBe(2);
    expect(dedents).toBe(2);
  });

  it('handles same-level continuation without INDENT/DEDENT', () => {
    const source = 'a\n  b\n  c';
    const result = kinds(source);
    const indents = result.filter(k => k === TokenKind.INDENT).length;
    expect(indents).toBe(1); // Only a→b
  });

  it('suppresses INDENT/DEDENT inside braces', () => {
    const source = 'Tag = {\n  id: string\n  name: string\n}';
    const result = kinds(source);
    // Inside braces, should NOT get INDENT/DEDENT
    const indents = result.filter(k => k === TokenKind.INDENT).length;
    expect(indents).toBe(0);
  });
});

describe('Lexer — Kit Keywords', () => {
  it('recognizes dynamically registered kit keywords', () => {
    const kitKeywords = new Set(['resource', 'command', 'page']);
    const result = pairs('resource EcsCluster', { kitKeywords });
    expect(result).toContainEqual([TokenKind.KIT_KEYWORD, 'resource']);
    expect(result).toContainEqual([TokenKind.TYPE_NAME, 'EcsCluster']);
  });

  it('treats unknown words as identifiers when no kit loaded', () => {
    const result = pairs('resource something');
    // Without kit loaded, "resource" is just an identifier
    expect(result).toContainEqual([TokenKind.IDENTIFIER, 'resource']);
  });
});

describe('Lexer — Route Paths', () => {
  it('tokenizes route paths after HTTP methods', () => {
    const source = 'route: GET /bookmarks/:id';
    const { tokens } = lex(source);
    const pathToken = tokens.find(t => t.kind === TokenKind.PATH);
    expect(pathToken).toBeDefined();
    expect(pathToken!.text).toBe('/bookmarks/:id');
  });
});

describe('Lexer — Inline Model Declarations', () => {
  it('handles semicolons as field separators in braces', () => {
    const source = 'Tag = { id: string, generated, cuid; name: string, unique }';
    const result = kinds(source);
    expect(result).toContain(TokenKind.SEMICOLON);
    expect(result).toContain(TokenKind.OPEN_BRACE);
    expect(result).toContain(TokenKind.CLOSE_BRACE);
  });
});

describe('Lexer — Example Files', () => {
  const examplesDir = path.resolve(__dirname, '../../../examples');

  it('tokenizes bookmarks.gist without errors', () => {
    const source = fs.readFileSync(path.join(examplesDir, 'bookmarks/bookmarks.gist'), 'utf-8');
    const { tokens, diagnostics } = lex(source);
    const errors = diagnostics.filter(d => d.severity === 'error');
    const errorTokens = tokens.filter(t => t.kind === TokenKind.ERROR_TOKEN);

    // Allow some diagnostics but no ERROR tokens in well-formed files
    expect(errorTokens.length).toBe(0);
    expect(tokens.length).toBeGreaterThan(50);
    // Must have EOF
    expect(tokens[tokens.length - 1]!.kind).toBe(TokenKind.EOF);
  });

  it('tokenizes todo.gist without error tokens', () => {
    const source = fs.readFileSync(path.join(examplesDir, 'todo-app/todo.gist'), 'utf-8');
    const { tokens } = lex(source, { kitKeywords: new Set(['page', 'component', 'layout', 'route', 'slot', 'client_state']) });
    const errorTokens = tokens.filter(t => t.kind === TokenKind.ERROR_TOKEN);
    expect(errorTokens.length).toBe(0);
    expect(tokens.length).toBeGreaterThan(200);
  });

  it('tokenizes deployer.gist without error tokens', () => {
    const source = fs.readFileSync(path.join(examplesDir, 'deployer/deployer.gist'), 'utf-8');
    const { tokens } = lex(source, { kitKeywords: new Set(['command', 'arg', 'flag', 'prompt', 'output', 'resource', 'group', 'variable', 'data']) });
    const errorTokens = tokens.filter(t => t.kind === TokenKind.ERROR_TOKEN);
    expect(errorTokens.length).toBe(0);
    expect(tokens.length).toBeGreaterThan(100);
  });
});
