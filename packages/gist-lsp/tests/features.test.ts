import { describe, it, expect, beforeEach } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { computeCompletions } from '../src/features/completion.js';
import { computeHover } from '../src/features/hover.js';
import { computeSemanticTokens, TOKEN_TYPES } from '../src/features/semantic-tokens.js';
import { SymbolTable } from '../src/analysis/symbol-table.js';
import { KitRegistry } from '../src/workspace/kit-registry.js';
import { parseKitYaml } from '../src/workspace/kit-loader.js';
import { lex, parse, cstToAst } from '@gist-lang/parser';
import type { GistProjectConfig } from '../src/workspace/types.js';

// ─── Helpers ──────────────────────────────────────────────

function makeDoc(content: string): TextDocument {
  return TextDocument.create('file:///test.gist', 'gist', 1, content);
}

function parseToSymbols(source: string, config?: GistProjectConfig | null): SymbolTable {
  const tokens = lex(source).tokens;
  const cst = parse(tokens).cst;
  const ast = cstToAst(cst);
  return SymbolTable.build(ast, config);
}

function makeKitRegistry(): KitRegistry {
  const registry = new KitRegistry();
  const webKit = parseKitYaml(`
kit: web
version: "1.0"
keywords:
  - page
  - component
  - layout
constructs:
  page:
    kind: declaration
    name_style: PascalCase
    doc: "A web page"
    fields:
      path:
        type: string
        required: true
        doc: "URL path"
      auth:
        type: string
        values: [public, private, role-based]
        doc: "Authentication requirement"
  component:
    kind: declaration
    name_style: PascalCase
    doc: "A reusable UI component"
    fields:
      props:
        type: string
        doc: "Component props"
`);
  if (webKit) registry.addKit(webKit);
  return registry;
}

const sampleConfig: GistProjectConfig = {
  project: 'test',
  services: {
    stripe: { type: 'payment', base_url: 'https://api.stripe.com' },
    sendgrid: { type: 'email', base_url_env: 'SENDGRID_URL' },
  },
  kitSections: {},
};

// ─── Completion Tests ─────────────────────────────────────

describe('computeCompletions', () => {
  it('offers top-level keywords at indent 0', () => {
    const doc = makeDoc('');
    const items = computeCompletions(doc, { line: 0, character: 0 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('project');
    expect(labels).toContain('module');
    expect(labels).toContain('type');
    expect(labels).toContain('trait');
    expect(labels).toContain('state');
    expect(labels).toContain('test');
    expect(labels).toContain('use');
    expect(labels).toContain('extend');
  });

  it('offers kit keywords at top level when registry is available', () => {
    const doc = makeDoc('');
    const registry = makeKitRegistry();
    const items = computeCompletions(doc, { line: 0, character: 0 }, undefined, registry, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('page');
    expect(labels).toContain('component');
  });

  it('offers project header keywords inside project block', () => {
    const doc = makeDoc('project myapp\n  ');
    const items = computeCompletions(doc, { line: 1, character: 2 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('kit:');
    expect(labels).toContain('stack:');
    expect(labels).toContain('style:');
    expect(labels).toContain('rules');
    expect(labels).toContain('always:');
  });

  it('offers module body keywords inside module block', () => {
    const doc = makeDoc('module auth\n  ');
    const items = computeCompletions(doc, { line: 1, character: 2 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('to');
    expect(labels).toContain('fn');
    expect(labels).toContain('flow');
    expect(labels).toContain('on');
    expect(labels).toContain('needs:');
  });

  it('offers intent body keywords inside intent block', () => {
    const doc = makeDoc('module auth\n  to login(email: string)\n    ');
    const items = computeCompletions(doc, { line: 2, character: 4 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('route:');
    expect(labels).toContain('saves:');
    expect(labels).toContain('emits:');
    expect(labels).toContain('do:');
    expect(labels).toContain('must:');
    expect(labels).toContain('public');
  });

  it('offers primitive types in type position', () => {
    const doc = makeDoc('User = {\n  name: ');
    const items = computeCompletions(doc, { line: 1, character: 8 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('string');
    expect(labels).toContain('int');
    expect(labels).toContain('bool');
    expect(labels).toContain('result');
    expect(labels).toContain('map');
  });

  it('offers declared types in type position', () => {
    const source = 'User = { name: string }\nRole = admin | member';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source + '\nPost = {\n  author: ');
    const items = computeCompletions(doc, { line: 3, character: 10 }, symbols, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('User');
    expect(labels).toContain('Role');
    expect(labels).toContain('string');
  });

  it('offers services in uses: position', () => {
    const source = 'module payments\n  to charge()\n    uses: ';
    const symbols = parseToSymbols('', sampleConfig);
    const doc = makeDoc(source);
    const items = computeCompletions(doc, { line: 2, character: 10 }, symbols, null, sampleConfig);
    const labels = items.map(i => i.label);
    expect(labels).toContain('stripe');
    expect(labels).toContain('sendgrid');
  });

  it('offers kit names in kit: position', () => {
    const doc = makeDoc('project myapp\n  kit: ');
    const registry = makeKitRegistry();
    const items = computeCompletions(doc, { line: 1, character: 7 }, undefined, registry, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('web');
  });

  it('offers models in needs: position', () => {
    const source = 'User = { name: string }\nmodule auth\n  needs: ';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const items = computeCompletions(doc, { line: 2, character: 9 }, symbols, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('User');
  });

  it('offers test body keywords inside test block', () => {
    const doc = makeDoc('test "login"\n  ');
    const items = computeCompletions(doc, { line: 1, character: 2 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('given:');
    expect(labels).toContain('call');
    expect(labels).toContain('expect:');
    expect(labels).toContain('then');
  });

  it('offers fn body keywords inside fn block', () => {
    const doc = makeDoc('module utils\n  fn validate()\n    ');
    const items = computeCompletions(doc, { line: 2, character: 4 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('do:');
    expect(labels).toContain('must:');
    expect(labels).toContain('ensure:');
    // fn should NOT offer route/saves/emits (those are intent-only)
    expect(labels).not.toContain('route:');
    expect(labels).not.toContain('saves:');
  });

  it('offers stage/compensate inside flow block', () => {
    const doc = makeDoc('module deploy\n  flow release()\n    ');
    const items = computeCompletions(doc, { line: 2, character: 4 }, undefined, null, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('stage');
    expect(labels).toContain('compensate:');
  });
});

// ─── Hover Tests ──────────────────────────────────────────

describe('computeHover', () => {
  it('shows model info on hover', () => {
    const source = 'User = { name: string; email: string }';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 0, character: 1 }, symbols, null);
    expect(hover).not.toBeNull();
    expect(hover!.contents).toHaveProperty('value');
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('User');
    expect(value).toContain('Model');
    expect(value).toContain('name');
    expect(value).toContain('email');
  });

  it('shows enum info on hover', () => {
    const source = 'Role = admin | member | guest';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 0, character: 1 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Role');
    expect(value).toContain('Enum');
    expect(value).toContain('admin');
    expect(value).toContain('member');
  });

  it('shows module info with intents on hover', () => {
    const source = 'module auth\n  > Authentication module\n  to login(email: string) -> User\n    do:\n      validate credentials';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 0, character: 8 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('auth');
    expect(value).toContain('Module');
    expect(value).toContain('login');
  });

  it('shows intent info on hover', () => {
    const source = 'module auth\n  to login(email: string) -> User\n    do:\n      check email';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    // Hover on "login" at line 1, character 5
    const hover = computeHover(doc, { line: 1, character: 5 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('login');
    expect(value).toContain('auth');
  });

  it('shows kit construct info on hover', () => {
    const registry = makeKitRegistry();
    const doc = makeDoc('page Dashboard\n  path: /dashboard');
    const hover = computeHover(doc, { line: 0, character: 1 }, undefined, registry);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('page');
    expect(value).toContain('Kit construct');
    expect(value).toContain('web');
    expect(value).toContain('path');
  });

  it('shows service info on hover', () => {
    const symbols = parseToSymbols('', sampleConfig);
    const doc = makeDoc('module pay\n  to charge()\n    uses: stripe');
    const hover = computeHover(doc, { line: 2, character: 11 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('stripe');
    expect(value).toContain('Service');
    expect(value).toContain('payment');
  });

  it('shows state machine info on hover', () => {
    const source = 'Order = { status: string }\nstate OrderStatus for Order.status:\n  pending -> confirmed\n  confirmed -> shipped';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 1, character: 7 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('OrderStatus');
    expect(value).toContain('State machine');
    expect(value).toContain('pending');
    expect(value).toContain('confirmed');
  });

  it('shows trait info on hover', () => {
    const source = 'trait Timestamped\n  created_at: datetime\n  updated_at: datetime';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 0, character: 7 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Timestamped');
    expect(value).toContain('Trait');
    expect(value).toContain('created_at');
  });

  it('returns null for unknown words', () => {
    const doc = makeDoc('some random text');
    const hover = computeHover(doc, { line: 0, character: 5 }, undefined, null);
    expect(hover).toBeNull();
  });

  it('shows error info on hover', () => {
    const source = 'NotFound = error { message: string }';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 0, character: 3 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('NotFound');
    expect(value).toContain('Error');
    expect(value).toContain('message');
  });

  it('shows type alias info on hover', () => {
    const source = 'type Email = string';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 0, character: 6 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Email');
    expect(value).toContain('Type alias');
    expect(value).toContain('string');
  });

  it('shows fn info on hover', () => {
    const source = 'module utils\n  fn validate(email: string) -> bool\n    do:\n      check format';
    const symbols = parseToSymbols(source);
    const doc = makeDoc(source);
    const hover = computeHover(doc, { line: 1, character: 6 }, symbols, null);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('validate');
    expect(value).toContain('utils');
  });
});

// ─── Semantic Tokens Tests ────────────────────────────────

describe('computeSemanticTokens', () => {
  it('produces tokens for a simple document', () => {
    const doc = makeDoc('module auth\n  to login(email: string)\n    do:\n      validate');
    const result = computeSemanticTokens(doc, null);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('highlights kit keywords as macro type', () => {
    const registry = makeKitRegistry();
    const doc = makeDoc('page Dashboard\n  path: /dashboard');
    const result = computeSemanticTokens(doc, registry);
    // The token data is encoded as delta line, delta char, length, type, modifiers
    // Kit keyword "page" should appear with type index for "macro"
    expect(result.data.length).toBeGreaterThan(0);
    // Decode first token — should be "page" at line 0, col 0
    const [deltaLine, deltaChar, length, tokenType] = result.data;
    expect(deltaLine).toBe(0);
    expect(deltaChar).toBe(0);
    expect(length).toBe(4); // "page"
    expect(tokenType).toBe(TOKEN_TYPES.indexOf('macro'));
  });

  it('highlights HTTP methods as method type', () => {
    const doc = makeDoc('module api\n  to get_users()\n    route: GET /users');
    const result = computeSemanticTokens(doc, null);
    // Find the GET token
    const data = result.data;
    let found = false;
    for (let i = 0; i < data.length; i += 5) {
      if (data[i + 3] === TOKEN_TYPES.indexOf('method')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('highlights declaration keyword followed by function name', () => {
    const doc = makeDoc('module auth\n  to login()');
    const result = computeSemanticTokens(doc, null);
    const data = result.data;
    // Look for a "function" token type (index 10)
    let foundFunction = false;
    for (let i = 0; i < data.length; i += 5) {
      if (data[i + 3] === TOKEN_TYPES.indexOf('function')) {
        foundFunction = true;
        break;
      }
    }
    expect(foundFunction).toBe(true);
  });

  it('highlights type names as type', () => {
    const doc = makeDoc('User = { name: string }');
    const result = computeSemanticTokens(doc, null);
    const data = result.data;
    // First token should be TYPE_NAME "User" with type = 'type' (index 1)
    expect(data[3]).toBe(TOKEN_TYPES.indexOf('type'));
  });
});
