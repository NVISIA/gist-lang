import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseGistYamlContent } from '../src/workspace/gist-yaml-parser.js';
import { parseKitYaml, loadKit } from '../src/workspace/kit-loader.js';
import { KitRegistry } from '../src/workspace/kit-registry.js';
import { discoverWorkspace } from '../src/workspace/project-discovery.js';

// ─── gist-yaml-parser ─────────────────────────────────────────

describe('parseGistYamlContent', () => {
  it('parses a minimal gist.yaml', () => {
    const config = parseGistYamlContent(`
project: my-app
version: "1.0"
description: A test project
`);
    expect(config).not.toBeNull();
    expect(config!.project).toBe('my-app');
    expect(config!.version).toBe('1.0');
    expect(config!.description).toBe('A test project');
  });

  it('parses runtime config', () => {
    const config = parseGistYamlContent(`
project: app
runtime:
  language: typescript
  platform: node
  version: "20"
  package_manager: pnpm
`);
    expect(config!.runtime).toEqual({
      language: 'typescript',
      platform: 'node',
      version: '20',
      package_manager: 'pnpm',
    });
  });

  it('parses framework config', () => {
    const config = parseGistYamlContent(`
project: app
framework:
  name: express
  version: "4"
`);
    expect(config!.framework).toEqual({ name: 'express', version: '4' });
  });

  it('parses database config with connection', () => {
    const config = parseGistYamlContent(`
project: app
database:
  type: postgresql
  version: "16"
  orm: prisma
  migrations: auto
  connection:
    env: DATABASE_URL
`);
    expect(config!.database).toEqual({
      type: 'postgresql',
      version: '16',
      orm: 'prisma',
      migrations: 'auto',
      connection: { env: 'DATABASE_URL' },
    });
  });

  it('parses services config', () => {
    const config = parseGistYamlContent(`
project: app
services:
  stripe:
    type: payment
    base_url: "https://api.stripe.com"
    auth:
      type: api_key
      key_env: STRIPE_KEY
`);
    expect(config!.services).toBeDefined();
    expect(config!.services!['stripe']).toEqual({
      type: 'payment',
      base_url: 'https://api.stripe.com',
      base_url_env: undefined,
      auth: { type: 'api_key', key_env: 'STRIPE_KEY' },
    });
  });

  it('parses env vars config', () => {
    const config = parseGistYamlContent(`
project: app
env:
  NODE_ENV:
    type: string
    required: true
    values:
      - development
      - production
  PORT:
    type: number
    default: 3000
`);
    expect(config!.env).toBeDefined();
    expect(config!.env!['NODE_ENV']).toEqual({
      type: 'string',
      required: true,
      secret: undefined,
      default: undefined,
      values: ['development', 'production'],
    });
    expect(config!.env!['PORT']).toEqual({
      type: 'number',
      required: undefined,
      secret: undefined,
      default: 3000,
      values: undefined,
    });
  });

  it('collects unknown keys as kitSections', () => {
    const config = parseGistYamlContent(`
project: app
web:
  type: spa
  base_url: /
iac:
  tool: terraform
`);
    expect(config!.kitSections['web']).toEqual({ type: 'spa', base_url: '/' });
    expect(config!.kitSections['iac']).toEqual({ tool: 'terraform' });
  });

  it('parses conventions config', () => {
    const config = parseGistYamlContent(`
project: app
conventions:
  id_format: cuid
  timestamps: iso8601
  soft_delete: true
  json_keys: camelCase
  db_columns: snake_case
`);
    expect(config!.conventions).toEqual({
      id_format: 'cuid',
      timestamps: 'iso8601',
      soft_delete: true,
      json_keys: 'camelCase',
      db_columns: 'snake_case',
      error_format: undefined,
    });
  });

  it('returns null for invalid YAML', () => {
    expect(parseGistYamlContent('{ invalid:: yaml:::')).toBeNull();
  });

  it('returns null for non-object YAML', () => {
    expect(parseGistYamlContent('just a string')).toBeNull();
  });
});

// ─── kit-loader ───────────────────────────────────────────────

describe('parseKitYaml', () => {
  it('parses a minimal kit.yaml', () => {
    const kit = parseKitYaml(`
kit: test-kit
version: 1.0.0
keywords:
  - widget
  - gadget
constructs:
  widget:
    kind: declaration
    name_style: PascalCase
    doc: A test widget
    fields:
      color: { type: identifier }
`);
    expect(kit).not.toBeNull();
    expect(kit!.name).toBe('test-kit');
    expect(kit!.version).toBe('1.0.0');
    expect(kit!.keywords).toEqual(['widget', 'gadget']);
    expect(kit!.constructs.size).toBe(1);
    expect(kit!.constructs.get('widget')).toEqual({
      kind: 'declaration',
      nameStyle: 'PascalCase',
      doc: 'A test widget',
      fields: { color: { type: 'identifier', doc: undefined, required: undefined, default: undefined, values: undefined, completions: undefined } },
      children: undefined,
      supports: undefined,
      snippet: undefined,
    });
  });

  it('parses construct with children, supports, snippet', () => {
    const kit = parseKitYaml(`
kit: test
version: 1.0.0
keywords:
  - group
constructs:
  group:
    kind: block
    name_style: identifier
    doc: A grouping construct
    children: [widget, gadget]
    supports: [must, context_line]
    snippet: |
      group \${1:name}
        \${0}
`);
    const construct = kit!.constructs.get('group')!;
    expect(construct.kind).toBe('block');
    expect(construct.children).toEqual(['widget', 'gadget']);
    expect(construct.supports).toEqual(['must', 'context_line']);
    expect(construct.snippet).toContain('group');
  });

  it('parses construct fields with values and completions', () => {
    const kit = parseKitYaml(`
kit: test
version: 1.0.0
keywords:
  - resource
constructs:
  resource:
    kind: block
    name_style: PascalCase
    doc: A resource
    fields:
      provider: { type: identifier, doc: Cloud provider, completions: [aws, gcp, azure] }
      type: { type: prose, required: true }
      tags: { type: identifier, values: [auto, manual] }
`);
    const fields = kit!.constructs.get('resource')!.fields;
    expect(fields['provider'].completions).toEqual(['aws', 'gcp', 'azure']);
    expect(fields['type'].required).toBe(true);
    expect(fields['tags'].values).toEqual(['auto', 'manual']);
  });

  it('parses yaml_sections', () => {
    const kit = parseKitYaml(`
kit: test
version: 1.0.0
keywords: []
yaml_sections:
  web:
    description: Web config
    fields:
      type: { type: string, values: [spa, ssr], default: spa }
      base_url: { type: string }
`);
    expect(kit!.yamlSections['web']).toBeDefined();
    expect(kit!.yamlSections['web'].description).toBe('Web config');
    expect(kit!.yamlSections['web'].fields['type']).toEqual({
      type: 'string',
      required: undefined,
      default: 'spa',
      values: ['spa', 'ssr'],
      fields: undefined,
    });
  });

  it('parses extends list', () => {
    const kit = parseKitYaml(`
kit: test
version: 1.0.0
keywords: []
extends:
  - state
  - on
  - fn
`);
    expect(kit!.extends).toEqual(['state', 'on', 'fn']);
  });

  it('parses full metadata', () => {
    const kit = parseKitYaml(`
kit: web
version: 1.0.0
author: gist-core
description: Web frontend constructs
license: MIT
keywords:
  - page
`);
    expect(kit!.author).toBe('gist-core');
    expect(kit!.description).toBe('Web frontend constructs');
    expect(kit!.license).toBe('MIT');
  });

  it('returns null for missing kit name', () => {
    expect(parseKitYaml('version: 1.0.0\nkeywords: []')).toBeNull();
  });

  it('returns null for invalid YAML', () => {
    expect(parseKitYaml('{ bad:: yaml')).toBeNull();
  });
});

describe('loadKit (filesystem)', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('loads the web kit from kits/web/', () => {
    const kit = loadKit(path.join(repoRoot, 'kits', 'web'));
    expect(kit).not.toBeNull();
    expect(kit!.name).toBe('web');
    expect(kit!.keywords).toContain('page');
    expect(kit!.keywords).toContain('component');
    expect(kit!.keywords).toContain('layout');
    expect(kit!.constructs.has('page')).toBe(true);
    expect(kit!.constructs.get('page')!.kind).toBe('declaration');
    expect(kit!.constructs.get('page')!.nameStyle).toBe('PascalCase');
  });

  it('loads the iac kit from kits/iac/', () => {
    const kit = loadKit(path.join(repoRoot, 'kits', 'iac'));
    expect(kit).not.toBeNull();
    expect(kit!.name).toBe('iac');
    expect(kit!.keywords).toContain('resource');
    expect(kit!.keywords).toContain('group');
    expect(kit!.constructs.has('resource')).toBe(true);
    expect(kit!.constructs.get('resource')!.fields['provider'].completions).toEqual(['aws', 'gcp', 'azure', 'cloudflare']);
  });

  it('loads the cli kit from kits/cli/', () => {
    const kit = loadKit(path.join(repoRoot, 'kits', 'cli'));
    expect(kit).not.toBeNull();
    expect(kit!.name).toBe('cli');
    expect(kit!.keywords).toContain('command');
    expect(kit!.constructs.has('command')).toBe(true);
    expect(kit!.constructs.get('command')!.children).toEqual(['command', 'arg', 'flag']);
  });

  it('returns null for nonexistent directory', () => {
    expect(loadKit('/nonexistent/path')).toBeNull();
  });
});

// ─── kit-registry ─────────────────────────────────────────────

describe('KitRegistry', () => {
  it('registers and looks up keywords', () => {
    const registry = new KitRegistry();
    const kit = parseKitYaml(`
kit: test
version: 1.0.0
keywords:
  - widget
  - gadget
constructs:
  widget:
    kind: declaration
    name_style: PascalCase
    doc: A widget
`)!;
    registry.addKit(kit);

    expect(registry.isKitKeyword('widget')).toBe(true);
    expect(registry.isKitKeyword('gadget')).toBe(true);
    expect(registry.isKitKeyword('unknown')).toBe(false);
  });

  it('returns construct definitions', () => {
    const registry = new KitRegistry();
    const kit = parseKitYaml(`
kit: test
version: 1.0.0
keywords:
  - widget
constructs:
  widget:
    kind: declaration
    name_style: PascalCase
    doc: A widget
    fields:
      color: { type: identifier }
`)!;
    registry.addKit(kit);

    const construct = registry.getConstruct('widget');
    expect(construct).toBeDefined();
    expect(construct!.doc).toBe('A widget');
    expect(construct!.fields['color'].type).toBe('identifier');
  });

  it('returns all keywords as a Set', () => {
    const registry = new KitRegistry();
    const kit1 = parseKitYaml(`
kit: kit1
version: 1.0.0
keywords:
  - alpha
  - beta
`)!;
    const kit2 = parseKitYaml(`
kit: kit2
version: 1.0.0
keywords:
  - gamma
`)!;
    registry.addKit(kit1);
    registry.addKit(kit2);

    const keywords = registry.getAllKeywords();
    expect(keywords).toBeInstanceOf(Set);
    expect(keywords.has('alpha')).toBe(true);
    expect(keywords.has('beta')).toBe(true);
    expect(keywords.has('gamma')).toBe(true);
  });

  it('tracks source kit for keywords', () => {
    const registry = new KitRegistry();
    const kit = parseKitYaml(`
kit: web
version: 1.0.0
keywords:
  - page
`)!;
    registry.addKit(kit);

    expect(registry.getKitForKeyword('page')).toBe('web');
  });

  it('tracks loaded kit names', () => {
    const registry = new KitRegistry();
    const kit1 = parseKitYaml('kit: web\nversion: 1.0.0\nkeywords: []')!;
    const kit2 = parseKitYaml('kit: cli\nversion: 1.0.0\nkeywords: []')!;
    registry.addKit(kit1);
    registry.addKit(kit2);

    expect(registry.getLoadedKitNames()).toEqual(expect.arrayContaining(['web', 'cli']));
  });

  it('handles YAML sections', () => {
    const registry = new KitRegistry();
    const kit = parseKitYaml(`
kit: web
version: 1.0.0
keywords: []
yaml_sections:
  web:
    description: Web config
    fields:
      type: { type: string }
`)!;
    registry.addKit(kit);

    expect(registry.getYamlSectionNames()).toContain('web');
    const section = registry.getYamlSection('web');
    expect(section).toBeDefined();
    expect(section!.kit).toBe('web');
    expect(section!.section.description).toBe('Web config');
  });

  it('clear() removes all data', () => {
    const registry = new KitRegistry();
    const kit = parseKitYaml(`
kit: test
version: 1.0.0
keywords:
  - thing
`)!;
    registry.addKit(kit);
    expect(registry.isKitKeyword('thing')).toBe(true);

    registry.clear();
    expect(registry.isKitKeyword('thing')).toBe(false);
    expect(registry.getLoadedKitNames()).toHaveLength(0);
  });

  it('later kit overrides conflicting keyword', () => {
    const registry = new KitRegistry();
    const kit1 = parseKitYaml(`
kit: kit1
version: 1.0.0
keywords:
  - widget
`)!;
    const kit2 = parseKitYaml(`
kit: kit2
version: 1.0.0
keywords:
  - widget
`)!;
    registry.addKit(kit1);
    registry.addKit(kit2);

    // Last one wins
    expect(registry.getKitForKeyword('widget')).toBe('kit2');
  });
});

// ─── project-discovery ────────────────────────────────────────

describe('discoverWorkspace', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('discovers bookmarks example workspace', () => {
    const workspace = discoverWorkspace(path.join(repoRoot, 'examples', 'bookmarks'));
    expect(workspace.gistYamlPath).toBeDefined();
    expect(workspace.gistFiles.length).toBeGreaterThan(0);
    expect(workspace.gistFiles.some(f => f.endsWith('bookmarks.gist'))).toBe(true);
  });

  it('discovers todo-app example workspace', () => {
    const workspace = discoverWorkspace(path.join(repoRoot, 'examples', 'todo-app'));
    expect(workspace.gistYamlPath).toBeDefined();
    expect(workspace.gistFiles.some(f => f.endsWith('todo.gist'))).toBe(true);
  });

  it('discovers kit directories from repo root', () => {
    const workspace = discoverWorkspace(repoRoot);
    expect(workspace.kitDirs.length).toBeGreaterThan(0);
    // Should find at least web, iac, cli kits
    const kitNames = workspace.kitDirs.map(d => path.basename(d));
    expect(kitNames).toContain('web');
    expect(kitNames).toContain('iac');
    expect(kitNames).toContain('cli');
  });

  it('finds kits from example subdirectory (walks up)', () => {
    const workspace = discoverWorkspace(path.join(repoRoot, 'examples', 'bookmarks'));
    // Should find kits/ by walking up from examples/bookmarks → examples → repo root
    expect(workspace.kitDirs.length).toBeGreaterThan(0);
  });

  it('handles nonexistent directory gracefully', () => {
    const workspace = discoverWorkspace('/nonexistent/path');
    expect(workspace.gistFiles).toEqual([]);
    expect(workspace.kitDirs).toEqual([]);
  });
});

// ─── Integration: full pipeline ───────────────────────────────

describe('Integration: workspace → kit loading → parse', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('loads all 6 built-in kits', () => {
    const workspace = discoverWorkspace(repoRoot);
    const registry = new KitRegistry();

    for (const dir of workspace.kitDirs) {
      const kit = loadKit(dir);
      if (kit) registry.addKit(kit);
    }

    const names = registry.getLoadedKitNames();
    expect(names.length).toBeGreaterThanOrEqual(6);
    expect(names).toContain('web');
    expect(names).toContain('iac');
    expect(names).toContain('cli');
    expect(names).toContain('api');
    expect(names).toContain('mobile');
    expect(names).toContain('gamedev');
  });

  it('gist.yaml + kit registry provides full config', () => {
    const workspace = discoverWorkspace(path.join(repoRoot, 'examples', 'todo-app'));
    expect(workspace.gistYamlPath).toBeDefined();

    const config = parseGistYamlContent(
      require('fs').readFileSync(workspace.gistYamlPath!, 'utf-8')
    );
    expect(config).not.toBeNull();
    expect(config!.project).toBe('todo-app');
    expect(config!.runtime?.language).toBe('Java');

    // Load kits and verify web kit keywords available
    const registry = new KitRegistry();
    for (const dir of workspace.kitDirs) {
      const kit = loadKit(dir);
      if (kit) registry.addKit(kit);
    }

    expect(registry.isKitKeyword('page')).toBe(true);
    expect(registry.isKitKeyword('component')).toBe(true);
  });
});
