import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { lex, parse, cstToAst } from '../src/index.js';
import type { GistProgram } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────

function parseToAst(source: string, kitKeywords?: string[]): GistProgram {
  const { tokens } = lex(source, { kitKeywords: kitKeywords ? new Set(kitKeywords) : undefined });
  const { cst } = parse(tokens);
  return cstToAst(cst);
}

function loadExampleFile(name: string, kitKeywords?: string[]): GistProgram {
  const root = join(__dirname, '..', '..', '..');
  const filePath = join(root, 'examples', name);
  const source = readFileSync(filePath, 'utf-8');
  return parseToAst(source, kitKeywords);
}

// ─── Unit Tests ───────────────────────────────────────────────

describe('cst-to-ast: project header', () => {
  it('extracts project name and context', () => {
    const ast = parseToAst(`project myapp\n  > A cool application`);
    expect(ast.project).toBeDefined();
    expect(ast.project!.name).toBe('myapp');
    expect(ast.project!.context).toEqual(['A cool application']);
  });

  it('extracts kit, stack, and always', () => {
    const ast = parseToAst(`project app\n  kit: web, cli\n  stack: gist.yaml\n  always:\n    all names must be unique`);
    expect(ast.project!.kit).toEqual(['web', 'cli']);
    expect(ast.project!.stack).toBe('gist.yaml');
    expect(ast.project!.always).toEqual(['all names must be unique']);
  });
});

describe('cst-to-ast: types', () => {
  it('extracts branded primitive type', () => {
    const ast = parseToAst(`type Email = string`);
    expect(ast.types).toHaveLength(1);
    expect(ast.types[0]!.name).toBe('Email');
    expect(ast.types[0]!.baseType).toBeDefined();
    expect(ast.types[0]!.baseType!.base.kind).toBe('primitive');
  });
});

describe('cst-to-ast: traits', () => {
  it('extracts trait with fields', () => {
    const ast = parseToAst(`trait Timestamped {\n  created_at: datetime\n  updated_at: datetime\n}`);
    expect(ast.traits).toHaveLength(1);
    expect(ast.traits[0]!.name).toBe('Timestamped');
    expect(ast.traits[0]!.fields).toHaveLength(2);
    expect(ast.traits[0]!.fields[0]!.name).toBe('created_at');
    expect(ast.traits[0]!.fields[1]!.name).toBe('updated_at');
  });

  it('extracts trait with spread', () => {
    const ast = parseToAst(`trait Full {\n  ...Timestamped\n  name: string\n}`);
    expect(ast.traits[0]!.spreads).toEqual(['Timestamped']);
    expect(ast.traits[0]!.fields).toHaveLength(1);
  });
});

describe('cst-to-ast: models', () => {
  it('extracts model with fields, modifiers, spreads', () => {
    const ast = parseToAst(`User = {\n  id: string, generated, cuid\n  email: string, unique\n  ...Timestamped\n}`);
    expect(ast.models).toHaveLength(1);
    const model = ast.models[0]!;
    expect(model.name).toBe('User');
    expect(model.fields).toHaveLength(2);
    expect(model.fields[0]!.name).toBe('id');
    expect(model.fields[0]!.modifiers).toContain('generated');
    expect(model.fields[0]!.modifiers).toContain('cuid');
    expect(model.fields[1]!.name).toBe('email');
    expect(model.fields[1]!.modifiers).toContain('unique');
    expect(model.spreads).toEqual(['Timestamped']);
  });

  it('extracts optional fields', () => {
    const ast = parseToAst(`Item = {\n  name: string\n  notes?: string\n}`);
    expect(ast.models[0]!.fields[0]!.optional).toBe(false);
    expect(ast.models[0]!.fields[1]!.optional).toBe(true);
  });

  it('extracts ephemeral/immutable modifier', () => {
    const ast = parseToAst(`Session = ephemeral {\n  token: string\n}`);
    expect(ast.models[0]!.modifier).toBe('ephemeral');
  });

  it('extracts inline model', () => {
    const ast = parseToAst(`Tag = { id: string, generated, cuid; name: string, unique }`);
    expect(ast.models).toHaveLength(1);
    expect(ast.models[0]!.name).toBe('Tag');
    expect(ast.models[0]!.fields).toHaveLength(2);
  });
});

describe('cst-to-ast: enums', () => {
  it('extracts enum values', () => {
    const ast = parseToAst(`Status = active | inactive | deleted`);
    expect(ast.enums).toHaveLength(1);
    expect(ast.enums[0]!.name).toBe('Status');
    expect(ast.enums[0]!.values).toEqual(['active', 'inactive', 'deleted']);
  });
});

describe('cst-to-ast: errors', () => {
  it('extracts error with fields', () => {
    const ast = parseToAst(`NotFound = error {\n  message: string\n}`);
    expect(ast.errors).toHaveLength(1);
    expect(ast.errors[0]!.name).toBe('NotFound');
    expect(ast.errors[0]!.fields).toHaveLength(1);
    expect(ast.errors[0]!.fields[0]!.name).toBe('message');
  });
});

describe('cst-to-ast: constants', () => {
  it('extracts constant', () => {
    const ast = parseToAst(`MAX_ITEMS = 100`);
    expect(ast.constants).toHaveLength(1);
    expect(ast.constants[0]!.name).toBe('MAX_ITEMS');
    expect(ast.constants[0]!.value).toBe('100');
  });
});

describe('cst-to-ast: state machines', () => {
  it('extracts state machine with transitions', () => {
    const ast = parseToAst(`state OrderState for Order.status:\n  pending -> confirmed -> shipped\n  shipped -> delivered`);
    expect(ast.stateMachines).toHaveLength(1);
    const sm = ast.stateMachines[0]!;
    expect(sm.name).toBe('OrderState');
    expect(sm.forModel).toBe('Order');
    expect(sm.forField).toBe('status');
    expect(sm.transitions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('cst-to-ast: modules', () => {
  it('extracts module with context and needs', () => {
    const ast = parseToAst(`module auth\n  > Handles authentication\n  needs: User, Session`);
    expect(ast.modules).toHaveLength(1);
    const mod = ast.modules[0]!;
    expect(mod.name).toBe('auth');
    expect(mod.context).toEqual(['Handles authentication']);
    expect(mod.needs).toEqual(['User', 'Session']);
  });
});

describe('cst-to-ast: intents', () => {
  it('extracts intent with full metadata', () => {
    const ast = parseToAst(`module items\n  to create(name: string) -> Item\n    route: POST /items\n    saves: Item\n    public\n    do:\n      create item with name`);
    const intent = ast.modules[0]!.intents[0]!;
    expect(intent.name).toBe('create');
    expect(intent.params).toHaveLength(1);
    expect(intent.params[0]!.name).toBe('name');
    expect(intent.returnType).toBeDefined();
    expect(intent.route).toBeDefined();
    expect(intent.route!.method).toBe('POST');
    expect(intent.route!.path).toBe('/items');
    expect(intent.saves).toEqual(['Item']);
    expect(intent.isPublic).toBe(true);
    expect(intent.doBlock).toBeDefined();
    expect(intent.doBlock!.length).toBeGreaterThan(0);
  });

  it('extracts multiple params with optional and default', () => {
    const ast = parseToAst(`module m\n  to search(q: string, limit?: int = 10) -> Item[]`);
    const intent = ast.modules[0]!.intents[0]!;
    expect(intent.params).toHaveLength(2);
    expect(intent.params[0]!.name).toBe('q');
    expect(intent.params[0]!.optional).toBe(false);
    expect(intent.params[1]!.name).toBe('limit');
    expect(intent.params[1]!.optional).toBe(true);
    expect(intent.params[1]!.defaultValue).toBe('10');
  });
});

describe('cst-to-ast: functions', () => {
  it('extracts fn with must', () => {
    const ast = parseToAst(`module utils\n  fn validate(url: string) -> bool\n    must: url is a valid URL`);
    const fn = ast.modules[0]!.fns[0]!;
    expect(fn.name).toBe('validate');
    expect(fn.params).toHaveLength(1);
    expect(fn.must).toBeDefined();
    expect(fn.must!.length).toBeGreaterThan(0);
  });
});

describe('cst-to-ast: flows', () => {
  it('extracts flow with stages', () => {
    const ast = parseToAst(`module deploy\n  flow deploy_service(name: string)\n    stage prepare:\n      check environment\n    stage execute:\n      run deployment`);
    const flow = ast.modules[0]!.flows[0]!;
    expect(flow.name).toBe('deploy_service');
    expect(flow.stages).toHaveLength(2);
    expect(flow.stages[0]!.name).toBe('prepare');
    expect(flow.stages[1]!.name).toBe('execute');
  });
});

describe('cst-to-ast: on handlers', () => {
  it('extracts on handler', () => {
    const ast = parseToAst(`module m\n  on user_created:\n    send welcome email`);
    const handler = ast.modules[0]!.onHandlers[0]!;
    expect(handler.event).toBe('user_created');
    expect(handler.body.length).toBeGreaterThan(0);
  });
});

describe('cst-to-ast: tests', () => {
  it('extracts test with steps', () => {
    const ast = parseToAst(`test basic_flow\n  call m.create("foo")\n  expect: returns item`);
    expect(ast.tests).toHaveLength(1);
    expect(ast.tests[0]!.name).toBe('basic_flow');
    expect(ast.tests[0]!.steps.length).toBeGreaterThan(0);
  });

  it('extracts given step', () => {
    const ast = parseToAst(`test with_given\n  given: an existing user\n  call m.get("id")\n  expect: returns user`);
    const steps = ast.tests[0]!.steps;
    expect(steps[0]!.kind).toBe('given');
  });

  it('extracts must fail step', () => {
    const ast = parseToAst(`test failure\n  call m.create("bad")\n  must fail: ValidationFailed`);
    const steps = ast.tests[0]!.steps;
    expect(steps.some(s => s.kind === 'must_fail')).toBe(true);
  });
});

describe('cst-to-ast: kit constructs', () => {
  it('extracts kit construct with children', () => {
    const ast = parseToAst(`page Home\n  route: /\n  do:\n    render the homepage`, ['page']);
    expect(ast.kitConstructs).toHaveLength(1);
    const kc = ast.kitConstructs[0]!;
    expect(kc.keyword).toBe('page');
    expect(kc.name).toBe('Home');
  });
});

describe('cst-to-ast: type references', () => {
  it('handles primitive types', () => {
    const ast = parseToAst(`module m\n  to create(name: string)`);
    const param = ast.modules[0]!.intents[0]!.params[0]!;
    expect(param.type).toBeDefined();
    expect(param.type!.base.kind).toBe('primitive');
    if (param.type!.base.kind === 'primitive') {
      expect(param.type!.base.name).toBe('string');
    }
  });

  it('handles named types', () => {
    const ast = parseToAst(`module m\n  to create(name: string) -> Item`);
    const ret = ast.modules[0]!.intents[0]!.returnType!;
    expect(ret.base.kind).toBe('named');
  });

  it('handles model references', () => {
    const ast = parseToAst(`Item = {\n  author: -> User\n}`);
    const field = ast.models[0]!.fields[0]!;
    expect(field.type).toBeDefined();
    expect(field.type!.base.kind).toBe('model_ref');
  });
});

describe('cst-to-ast: composition', () => {
  it('extracts use declaration', () => {
    const ast = parseToAst(`use "shared-auth"`);
    expect(ast.compositions).toHaveLength(1);
    expect(ast.compositions[0]!.compositionKind).toBe('use');
    if (ast.compositions[0]!.compositionKind === 'use') {
      expect(ast.compositions[0]!.target).toBe('shared-auth');
    }
  });
});

// ─── Integration Tests ────────────────────────────────────────

describe('cst-to-ast: bookmarks.gist integration', () => {
  it('parses and transforms the full file', () => {
    const ast = loadExampleFile('bookmarks/bookmarks.gist');

    // Project header
    expect(ast.project).toBeDefined();
    expect(ast.project!.name).toBe('bookmarks');
    expect(ast.project!.context.length).toBeGreaterThan(0);
    expect(ast.project!.stack).toBe('gist.yaml');
    expect(ast.project!.always).toBeDefined();
    expect(ast.project!.always!.length).toBe(2);

    // Models
    expect(ast.models).toHaveLength(2);
    const tag = ast.models.find(m => m.name === 'Tag');
    const bookmark = ast.models.find(m => m.name === 'Bookmark');
    expect(tag).toBeDefined();
    expect(bookmark).toBeDefined();
    expect(tag!.fields).toHaveLength(2);
    expect(bookmark!.fields.length).toBeGreaterThanOrEqual(5);

    // Module with intents
    expect(ast.modules).toHaveLength(1);
    const mod = ast.modules[0]!;
    expect(mod.name).toBe('bookmarks');
    expect(mod.intents).toHaveLength(5);

    const create = mod.intents.find(i => i.name === 'create');
    expect(create).toBeDefined();
    expect(create!.route).toBeDefined();
    expect(create!.route!.method).toBe('POST');
    expect(create!.route!.path).toBe('/bookmarks');
    expect(create!.saves).toBeDefined();
    expect(create!.doBlock).toBeDefined();
    expect(create!.must).toBeDefined();
    expect(create!.eg).toBeDefined();

    const list = mod.intents.find(i => i.name === 'list');
    expect(list).toBeDefined();
    expect(list!.isPublic).toBe(true);

    // Tests
    expect(ast.tests).toHaveLength(5);
    expect(ast.tests.map(t => t.name)).toEqual([
      'create_and_find',
      'invalid_url_rejected',
      'search_by_query',
      'update_tags',
      'delete_cleans_orphans',
    ]);
  });
});

describe('cst-to-ast: todo.gist integration', () => {
  it('parses and transforms the full file', () => {
    const ast = loadExampleFile('todo-app/todo.gist', ['page', 'component', 'layout', 'action']);

    expect(ast.project).toBeDefined();
    expect(ast.project!.name).toBe('todo');
    expect(ast.modules.length).toBeGreaterThan(0);
    expect(ast.models.length).toBeGreaterThan(0);

    // Should have state machines
    expect(ast.stateMachines.length).toBeGreaterThan(0);
  });
});

describe('cst-to-ast: deployer.gist integration', () => {
  it('parses and transforms the full file', () => {
    const ast = loadExampleFile('deployer/deployer.gist', [
      'command', 'arg', 'flag', 'resource', 'data_source', 'output', 'variable',
    ]);

    expect(ast.project).toBeDefined();
    expect(ast.project!.name).toBe('deployer');

    // deployer uses kit constructs (command, resource, etc.), not modules
    expect(ast.kitConstructs.length).toBeGreaterThan(0);

    // Should have models and types
    expect(ast.models.length).toBeGreaterThan(0);
    expect(ast.types.length).toBeGreaterThan(0);
  });
});
