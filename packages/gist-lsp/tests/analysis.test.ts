import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { lex, parse, cstToAst } from '@gist-lang/parser';
import type { GistProgram } from '@gist-lang/parser';
import { SymbolTable, runAllValidators, KitRegistry, parseKitYaml, loadKit, parseGistYamlContent } from '@gist-lang/workspace';
import { computeSemanticDiagnostics } from '../src/features/diagnostics.js';

const repoRoot = path.resolve(__dirname, '../../..');

function parseToAst(source: string, kitKeywords?: string[]): GistProgram {
  const { tokens } = lex(source, { kitKeywords: kitKeywords ? new Set(kitKeywords) : undefined });
  const { cst } = parse(tokens);
  return cstToAst(cst);
}

// ─── Symbol Table ────────────────────────────────────────────

describe('SymbolTable', () => {
  it('collects models, enums, types from AST', () => {
    // GIST syntax: Model = { fields }, Enum = val | val, type Name = baseType
    const ast = parseToAst(`
User = {
  name: string
  email: string
}

Role = admin | member | guest

type Email = string
`);
    const symbols = SymbolTable.build(ast);

    expect(symbols.models.has('User')).toBe(true);
    expect(symbols.enums.has('Role')).toBe(true);
    expect(symbols.types.has('Email')).toBe(true);
    expect(symbols.isTypeName('User')).toBe(true);
    expect(symbols.isTypeName('Role')).toBe(true);
    expect(symbols.isTypeName('Email')).toBe(true);
    expect(symbols.isTypeName('Unknown')).toBe(false);
  });

  it('collects traits', () => {
    // GIST syntax: trait Name { fields }
    const ast = parseToAst(`
trait Timestamped {
  created_at: datetime
  updated_at: datetime
}
`);
    const symbols = SymbolTable.build(ast);
    expect(symbols.traits.has('Timestamped')).toBe(true);
    expect(symbols.isTypeName('Timestamped')).toBe(true);
  });

  it('collects errors and constants', () => {
    // GIST syntax: Name = error { fields }, UPPER_NAME = value
    const ast = parseToAst(`
NotFound = error {
  message: string
  code: int
}

MAX_RETRIES = 3
`);
    const symbols = SymbolTable.build(ast);
    expect(symbols.errors.has('NotFound')).toBe(true);
    expect(symbols.constants.has('MAX_RETRIES')).toBe(true);
  });

  it('collects state machines', () => {
    // GIST syntax: state Name for Model.field:
    const ast = parseToAst(`
Order = {
  status: string
}

state OrderStatus for Order.status:
  pending -> confirmed
  confirmed -> shipped
  shipped -> delivered
`);
    const symbols = SymbolTable.build(ast);
    expect(symbols.stateMachines.has('OrderStatus')).toBe(true);
  });

  it('collects modules with intents and fns', () => {
    // GIST syntax: module name (lowercase)
    const ast = parseToAst(`
module auth
  > Handles authentication

  to login(email: string, password: string) -> User
    route: POST /auth/login
    do:
      validate credentials

  fn hash_password(raw: string) -> string
    do:
      hash with bcrypt
`);
    const symbols = SymbolTable.build(ast);
    expect(symbols.modules.has('auth')).toBe(true);
    expect(symbols.intents.has('auth.login')).toBe(true);
    expect(symbols.fns.has('auth.hash_password')).toBe(true);
  });

  it('collects routes from intents', () => {
    const ast = parseToAst(`
module api
  > API endpoints

  to get_user(id: string) -> User
    route: GET /users/:id
    do:
      find user by id

  to create_user(name: string) -> User
    route: POST /users
    do:
      create user
`);
    const symbols = SymbolTable.build(ast);
    expect(symbols.routes).toHaveLength(2);
    expect(symbols.routes[0].method).toBe('GET');
    expect(symbols.routes[0].path).toBe('/users/:id');
    expect(symbols.routes[1].method).toBe('POST');
  });

  it('collects services from gist.yaml config', () => {
    const config = parseGistYamlContent(`
project: app
services:
  stripe:
    type: payment
    base_url: "https://api.stripe.com"
  email:
    type: REST
    base_url_env: EMAIL_URL
`);
    const ast = parseToAst('User = { name: string }');
    const symbols = SymbolTable.build(ast, config);

    expect(symbols.services.has('stripe')).toBe(true);
    expect(symbols.services.has('email')).toBe(true);
  });

  it('resolves fields including trait spreads', () => {
    const ast = parseToAst(`
trait Timestamped {
  created_at: datetime
  updated_at: datetime
}

User = {
  ...Timestamped
  name: string
}
`);
    const symbols = SymbolTable.build(ast);
    const fields = symbols.getResolvedFields('User');

    const names = fields.map(f => f.name);
    expect(names).toContain('name');
    expect(names).toContain('created_at');
    expect(names).toContain('updated_at');
  });

  it('getAllTypeNames returns all type-like names', () => {
    const ast = parseToAst(`
User = { name: string }
Role = admin | member
type Email = string
trait Timestamped {
  created_at: datetime
}
`);
    const symbols = SymbolTable.build(ast);
    const names = symbols.getAllTypeNames();
    expect(names).toContain('User');
    expect(names).toContain('Role');
    expect(names).toContain('Email');
    expect(names).toContain('Timestamped');
  });
});

// ─── Validators ──────────────────────────────────────────────

describe('Validators', () => {
  describe('duplicate names', () => {
    it('detects duplicate model/type declarations', () => {
      const ast = parseToAst(`
User = { name: string }

type User = string
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const dupes = diags.filter(d => d.message.includes('Duplicate'));
      expect(dupes.length).toBeGreaterThan(0);
      expect(dupes[0].message).toContain("'User'");
    });
  });

  describe('type references', () => {
    it('warns about undeclared type in model field', () => {
      const ast = parseToAst(`
Order = {
  user: UnknownType
}
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const typeWarnings = diags.filter(d => d.message.includes('Undeclared'));
      expect(typeWarnings.length).toBeGreaterThan(0);
      expect(typeWarnings[0].message).toContain("'UnknownType'");
    });

    it('does not warn about primitive types', () => {
      const ast = parseToAst(`
User = {
  name: string
  age: int
  active: bool
}
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const typeWarnings = diags.filter(d => d.message.includes('Undeclared'));
      expect(typeWarnings).toHaveLength(0);
    });

    it('does not warn about declared model as type', () => {
      const ast = parseToAst(`
User = { name: string }

Order = {
  user: User
}
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const typeWarnings = diags.filter(d => d.message.includes('Undeclared'));
      expect(typeWarnings).toHaveLength(0);
    });
  });

  describe('duplicate routes', () => {
    it('detects duplicate route paths', () => {
      const ast = parseToAst(`
module api
  > endpoints

  to get_user(id: string) -> User
    route: GET /users/:id
    do:
      get user

  to get_user_alt(id: string) -> User
    route: GET /users/:id
    do:
      get user alt
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const routeDiags = diags.filter(d => d.message.includes('Duplicate route'));
      expect(routeDiags.length).toBeGreaterThan(0);
    });
  });

  describe('module needs', () => {
    it('warns when needs references undeclared type', () => {
      const ast = parseToAst(`
module orders
  > Order management
  needs: UnknownModel

  to list_orders() -> void
    do:
      list orders
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const needsWarnings = diags.filter(d => d.message.includes('needs'));
      expect(needsWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('state machine validation', () => {
    it('warns about undeclared model in for clause', () => {
      const ast = parseToAst(`
state OrderStatus for FakeModel.status:
  pending -> confirmed
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const smDiags = diags.filter(d => d.message.includes('undeclared model'));
      expect(smDiags.length).toBeGreaterThan(0);
    });

    it('warns about undeclared field on model', () => {
      const ast = parseToAst(`
Order = { name: string }

state OrderStatus for Order.status:
  pending -> confirmed
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const smDiags = diags.filter(d => d.message.includes('undeclared field'));
      expect(smDiags.length).toBeGreaterThan(0);
    });
  });

  describe('uses: references', () => {
    it('errors when uses references undefined service', () => {
      const ast = parseToAst(`
module payments
  > payment processing

  to charge(amount: int) -> void
    uses: stripe
    do:
      charge amount
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const usesDiags = diags.filter(d => d.message.includes('uses service'));
      expect(usesDiags.length).toBeGreaterThan(0);
      expect(usesDiags[0].message).toContain("'stripe'");
    });

    it('no error when uses references defined service', () => {
      const config = parseGistYamlContent(`
project: app
services:
  stripe:
    type: payment
`);
      const ast = parseToAst(`
module payments
  > payment processing

  to charge(amount: int) -> void
    uses: stripe
    do:
      charge amount
`);
      const symbols = SymbolTable.build(ast, config);
      const diags = runAllValidators(ast, symbols, null, []);

      const usesDiags = diags.filter(d => d.message.includes('uses service'));
      expect(usesDiags).toHaveLength(0);
    });
  });

  describe('spread validation', () => {
    it('warns when model spreads undeclared trait', () => {
      const ast = parseToAst(`
User = {
  ...UnknownTrait
  name: string
}
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const spreadDiags = diags.filter(d => d.message.includes('spreads'));
      expect(spreadDiags.length).toBeGreaterThan(0);
    });

    it('no warning when spreading declared trait', () => {
      const ast = parseToAst(`
trait Timestamped {
  created_at: datetime
}

User = {
  ...Timestamped
  name: string
}
`);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, null, []);

      const spreadDiags = diags.filter(d => d.message.includes('spreads'));
      expect(spreadDiags).toHaveLength(0);
    });
  });

  describe('kit keyword validation', () => {
    it('errors on unknown kit keyword when registry is present', () => {
      const registry = new KitRegistry();
      const kit = parseKitYaml(`
kit: web
version: 1.0.0
keywords:
  - page
  - component
constructs:
  page:
    kind: declaration
    name_style: PascalCase
    doc: A page
`)!;
      registry.addKit(kit);

      // "resource" is not in web kit
      const ast = parseToAst('resource MyResource', ['resource']);
      const symbols = SymbolTable.build(ast);
      const diags = runAllValidators(ast, symbols, registry, ['web']);

      const kitDiags = diags.filter(d => d.message.includes('Unknown keyword'));
      expect(kitDiags.length).toBeGreaterThan(0);
    });
  });
});

// ─── Integration with example files ─────────────────────────

describe('Semantic analysis on example files', () => {
  it('bookmarks.gist builds symbol table', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'examples/bookmarks/bookmarks.gist'), 'utf-8'
    );
    const configContent = fs.readFileSync(
      path.join(repoRoot, 'examples/bookmarks/gist.yaml'), 'utf-8'
    );
    const config = parseGistYamlContent(configContent);
    const ast = parseToAst(source);
    const { diagnostics, symbols } = computeSemanticDiagnostics(ast, config, null);

    // Bookmarks has Tag and Bookmark models
    expect(symbols.models.size).toBeGreaterThanOrEqual(2);
    expect(symbols.modules.size).toBeGreaterThanOrEqual(1);
  });

  it('todo.gist builds full symbol table', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'examples/todo-app/todo.gist'), 'utf-8'
    );
    const ast = parseToAst(source);
    const symbols = SymbolTable.build(ast);

    expect(symbols.models.size).toBeGreaterThan(0);
    expect(symbols.modules.size).toBeGreaterThan(0);
    expect(symbols.intents.size).toBeGreaterThan(0);
  });

  it('deployer.gist with kit registry loads constructs', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'examples/deployer/deployer.gist'), 'utf-8'
    );

    // Load cli and iac kits
    const registry = new KitRegistry();
    const cliKit = loadKit(path.join(repoRoot, 'kits/cli'));
    const iacKit = loadKit(path.join(repoRoot, 'kits/iac'));
    if (cliKit) registry.addKit(cliKit);
    if (iacKit) registry.addKit(iacKit);

    const kitKeywords = [...registry.getAllKeywords()];
    const ast = parseToAst(source, kitKeywords);
    const symbols = SymbolTable.build(ast);

    expect(symbols.kitConstructs.size).toBeGreaterThan(0);
  });
});
