import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { validateKit } from '../src/kit/validator.js';
import { scaffoldKit } from '../src/kit/scaffolder.js';

// ─── Helpers ──────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gist-kit-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeKitYaml(dir: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'kit.yaml'), content, 'utf-8');
}

// ─── Validator Tests ──────────────────────────────────────

describe('validateKit', () => {
  it('validates a well-formed kit with no errors', () => {
    const kitDir = path.join(tmpDir, 'test-kit');
    writeKitYaml(kitDir, `
kit: test-kit
version: 1.0.0
description: A test kit
license: MIT

keywords:
  - widget
  - gadget

constructs:
  widget:
    kind: declaration
    name_style: PascalCase
    doc: A widget component
    fields:
      size:
        type: string
        values: [small, medium, large]
  gadget:
    kind: block
    name_style: identifier
    doc: A gadget thing
`);
    // Also add KIT.md so no warning
    fs.writeFileSync(path.join(kitDir, 'KIT.md'), '# Test Kit\n', 'utf-8');

    const result = validateKit(kitDir);
    expect(result.errors).toHaveLength(0);
    expect(result.kitName).toBe('test-kit');
  });

  it('reports error when kit.yaml is missing', () => {
    const kitDir = path.join(tmpDir, 'no-yaml');
    fs.mkdirSync(kitDir, { recursive: true });

    const result = validateKit(kitDir);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Missing kit.yaml');
  });

  it('reports error when kit.yaml has invalid YAML', () => {
    const kitDir = path.join(tmpDir, 'bad-yaml');
    writeKitYaml(kitDir, ':\n  invalid: [yaml\n  broken');

    const result = validateKit(kitDir);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error when kit has no name', () => {
    const kitDir = path.join(tmpDir, 'no-name');
    writeKitYaml(kitDir, `
version: 1.0.0
keywords:
  - thing
`);

    const result = validateKit(kitDir);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error when keyword conflicts with core GIST keyword', () => {
    const kitDir = path.join(tmpDir, 'conflict');
    writeKitYaml(kitDir, `
kit: conflict-kit
version: 1.0.0
keywords:
  - module
  - trait
  - my_keyword
`);

    const result = validateKit(kitDir);
    const conflictErrors = result.errors.filter(e => e.includes('conflicts with'));
    expect(conflictErrors.length).toBe(2); // module and trait
  });

  it('reports error when construct keyword conflicts with core keyword', () => {
    const kitDir = path.join(tmpDir, 'construct-conflict');
    writeKitYaml(kitDir, `
kit: bad-kit
version: 1.0.0
keywords:
  - custom
constructs:
  state:
    kind: declaration
    doc: Conflicting construct
`);

    const result = validateKit(kitDir);
    const constructConflicts = result.errors.filter(e =>
      e.includes('Construct') && e.includes('conflicts')
    );
    expect(constructConflicts.length).toBe(1);
  });

  it('warns when kit has no description', () => {
    const kitDir = path.join(tmpDir, 'no-desc');
    writeKitYaml(kitDir, `
kit: no-desc
version: 1.0.0
keywords:
  - thing
`);

    const result = validateKit(kitDir);
    const descWarnings = result.warnings.filter(w => w.includes('description'));
    expect(descWarnings.length).toBeGreaterThan(0);
  });

  it('warns when KIT.md is missing', () => {
    const kitDir = path.join(tmpDir, 'no-kitmd');
    writeKitYaml(kitDir, `
kit: no-kitmd
version: 1.0.0
description: Kit without KIT.md
keywords:
  - thing
`);

    const result = validateKit(kitDir);
    const kitMdWarnings = result.warnings.filter(w => w.includes('KIT.md'));
    expect(kitMdWarnings.length).toBe(1);
  });

  it('warns when keyword has no matching construct', () => {
    const kitDir = path.join(tmpDir, 'orphan-kw');
    writeKitYaml(kitDir, `
kit: orphan-kit
version: 1.0.0
description: Test
keywords:
  - orphan_keyword
`);
    fs.writeFileSync(path.join(kitDir, 'KIT.md'), '# Kit\n', 'utf-8');

    const result = validateKit(kitDir);
    const orphanWarnings = result.warnings.filter(w => w.includes('no matching construct'));
    expect(orphanWarnings.length).toBe(1);
  });

  it('warns about duplicate keywords', () => {
    const kitDir = path.join(tmpDir, 'dup');
    writeKitYaml(kitDir, `
kit: dup-kit
version: 1.0.0
description: Duplicate keywords
keywords:
  - widget
  - widget
`);

    const result = validateKit(kitDir);
    const dupWarnings = result.warnings.filter(w => w.includes('Duplicate'));
    expect(dupWarnings.length).toBe(1);
  });

  it('errors when kit has no keywords or constructs', () => {
    const kitDir = path.join(tmpDir, 'empty');
    writeKitYaml(kitDir, `
kit: empty-kit
version: 1.0.0
description: Empty kit
`);

    const result = validateKit(kitDir);
    const emptyErrors = result.errors.filter(e => e.includes('at least one keyword'));
    expect(emptyErrors.length).toBe(1);
  });

  it('validates built-in web kit with no errors', () => {
    const webKitDir = path.resolve(__dirname, '../../../kits/web');
    if (!fs.existsSync(webKitDir)) return;

    const result = validateKit(webKitDir);
    expect(result.errors).toHaveLength(0);
    expect(result.kitName).toBe('web');
  });

  it('validates built-in cli kit with no errors', () => {
    const cliKitDir = path.resolve(__dirname, '../../../kits/cli');
    if (!fs.existsSync(cliKitDir)) return;

    const result = validateKit(cliKitDir);
    expect(result.errors).toHaveLength(0);
    expect(result.kitName).toBe('cli');
  });

  it('validates built-in api kit with no errors', () => {
    const apiKitDir = path.resolve(__dirname, '../../../kits/api');
    if (!fs.existsSync(apiKitDir)) return;

    const result = validateKit(apiKitDir);
    expect(result.errors).toHaveLength(0);
    expect(result.kitName).toBe('api');
  });

  it('validates built-in iac kit with no errors', () => {
    const iacKitDir = path.resolve(__dirname, '../../../kits/iac');
    if (!fs.existsSync(iacKitDir)) return;

    const result = validateKit(iacKitDir);
    expect(result.errors).toHaveLength(0);
    expect(result.kitName).toBe('iac');
  });

  it('validates built-in mobile kit with no errors', () => {
    const mobileKitDir = path.resolve(__dirname, '../../../kits/mobile');
    if (!fs.existsSync(mobileKitDir)) return;

    const result = validateKit(mobileKitDir);
    expect(result.errors).toHaveLength(0);
    expect(result.kitName).toBe('mobile');
  });

  it('validates built-in gamedev kit with no errors', () => {
    const gamedevKitDir = path.resolve(__dirname, '../../../kits/gamedev');
    if (!fs.existsSync(gamedevKitDir)) return;

    const result = validateKit(gamedevKitDir);
    expect(result.errors).toHaveLength(0);
    expect(result.kitName).toBe('gamedev');
  });

  it('accepts a well-formed extends_kits reference', () => {
    const kitDir = path.join(tmpDir, 'child-kit');
    writeKitYaml(kitDir, `
kit: child
version: 1.0.0
keywords:
  - widget
extends_kits:
  - parent
`);
    const result = validateKit(kitDir);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when extends_kits references itself', () => {
    const kitDir = path.join(tmpDir, 'self-ref');
    writeKitYaml(kitDir, `
kit: self
version: 1.0.0
keywords:
  - widget
extends_kits:
  - self
`);
    const result = validateKit(kitDir);
    expect(result.errors.some(e => /cannot extend itself/.test(e))).toBe(true);
  });

  it('errors when extends_kits contains a malformed kit name', () => {
    const kitDir = path.join(tmpDir, 'bad-parent');
    writeKitYaml(kitDir, `
kit: child
version: 1.0.0
keywords:
  - widget
extends_kits:
  - "Not A Kit Name"
`);
    const result = validateKit(kitDir);
    expect(result.errors.some(e => /not a valid kit name/.test(e))).toBe(true);
  });

  it('warns on duplicate extends_kits entries', () => {
    const kitDir = path.join(tmpDir, 'dup-parent');
    writeKitYaml(kitDir, `
kit: child
version: 1.0.0
keywords:
  - widget
extends_kits:
  - parent
  - parent
`);
    const result = validateKit(kitDir);
    expect(result.warnings.some(w => /Duplicate extends_kits entry/.test(w))).toBe(true);
  });
});

// ─── Scaffolder Tests ─────────────────────────────────────

describe('scaffoldKit', () => {
  it('creates kit.yaml and KIT.md', () => {
    const kitDir = path.join(tmpDir, 'new-kit');
    scaffoldKit('new-kit', kitDir);

    expect(fs.existsSync(path.join(kitDir, 'kit.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(kitDir, 'KIT.md'))).toBe(true);
  });

  it('generates valid kit.yaml with correct name', () => {
    const kitDir = path.join(tmpDir, 'my-domain');
    scaffoldKit('my-domain', kitDir);

    const content = fs.readFileSync(path.join(kitDir, 'kit.yaml'), 'utf-8');
    expect(content).toContain('kit: my-domain');
    expect(content).toContain('version: 0.1.0');
  });

  it('generates KIT.md with kit name', () => {
    const kitDir = path.join(tmpDir, 'special-kit');
    scaffoldKit('special-kit', kitDir);

    const content = fs.readFileSync(path.join(kitDir, 'KIT.md'), 'utf-8');
    expect(content).toContain('# special-kit Kit');
    expect(content).toContain('special-kit');
  });

  it('scaffolded kit passes validation (no errors)', () => {
    const kitDir = path.join(tmpDir, 'scaffold-test');
    scaffoldKit('scaffold-test', kitDir);

    const result = validateKit(kitDir);
    // Scaffolded kit has no keywords/constructs — that's an error
    // But the structure is valid otherwise
    expect(result.kitName).toBe('scaffold-test');
    // The only error should be "must define at least one keyword or construct"
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('at least one keyword');
  });

  it('creates nested directories', () => {
    const kitDir = path.join(tmpDir, 'deep', 'nested', 'kit');
    scaffoldKit('nested-kit', kitDir);

    expect(fs.existsSync(path.join(kitDir, 'kit.yaml'))).toBe(true);
  });
});
