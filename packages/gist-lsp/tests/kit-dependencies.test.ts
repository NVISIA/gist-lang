import { describe, it, expect } from 'vitest';
import {
  parseKitYaml,
  topoSortKits,
  resolveKitDependencies,
  detectKitDependencyIssues,
  KitRegistry,
} from '@gist-lang/workspace';
import type { LoadedKit } from '@gist-lang/workspace';

function mkKit(name: string, extendsKits: string[] = []): LoadedKit {
  const extLine = extendsKits.length
    ? `extends_kits:\n${extendsKits.map(k => `  - ${k}`).join('\n')}\n`
    : '';
  return parseKitYaml(`kit: ${name}\nversion: 1.0.0\nkeywords: []\n${extLine}`)!;
}

describe('parseKitYaml — extends_kits field', () => {
  it('parses an empty extends_kits as []', () => {
    const kit = parseKitYaml('kit: foo\nversion: 1.0.0')!;
    expect(kit.extendsKits).toEqual([]);
  });

  it('parses a populated extends_kits list', () => {
    const kit = parseKitYaml(
      'kit: child\nversion: 1.0.0\nextends_kits:\n  - parent_a\n  - parent_b\n'
    )!;
    expect(kit.extendsKits).toEqual(['parent_a', 'parent_b']);
  });
});

describe('topoSortKits', () => {
  it('returns kits unchanged when no extends_kits', () => {
    const kits = [mkKit('a'), mkKit('b'), mkKit('c')];
    const sorted = topoSortKits(kits);
    expect(sorted.map(k => k.name)).toEqual(['a', 'b', 'c']);
  });

  it('places parent before child', () => {
    const kits = [mkKit('child', ['parent']), mkKit('parent')];
    const sorted = topoSortKits(kits);
    expect(sorted.map(k => k.name)).toEqual(['parent', 'child']);
  });

  it('handles a multi-level chain', () => {
    const kits = [
      mkKit('grandchild', ['child']),
      mkKit('child', ['parent']),
      mkKit('parent'),
    ];
    const sorted = topoSortKits(kits);
    const idx = (n: string) => sorted.findIndex(k => k.name === n);
    expect(idx('parent')).toBeLessThan(idx('child'));
    expect(idx('child')).toBeLessThan(idx('grandchild'));
  });

  it('handles multiple parents', () => {
    const kits = [
      mkKit('child', ['a', 'b']),
      mkKit('a'),
      mkKit('b'),
    ];
    const sorted = topoSortKits(kits);
    const idx = (n: string) => sorted.findIndex(k => k.name === n);
    expect(idx('a')).toBeLessThan(idx('child'));
    expect(idx('b')).toBeLessThan(idx('child'));
  });

  it('silently skips unknown parent references', () => {
    const kits = [mkKit('child', ['missing']), mkKit('other')];
    const sorted = topoSortKits(kits);
    // Both kits emitted; order is whatever Kahn's algorithm chose with
    // in-degree zero (both qualify since 'missing' is not in the graph).
    expect(sorted.map(k => k.name).sort()).toEqual(['child', 'other']);
  });

  it('appends cyclic kits in discovery order rather than looping', () => {
    const kits = [
      mkKit('a', ['b']),
      mkKit('b', ['a']),
      mkKit('standalone'),
    ];
    const sorted = topoSortKits(kits);
    expect(sorted).toHaveLength(3);
    expect(sorted.map(k => k.name)).toContain('a');
    expect(sorted.map(k => k.name)).toContain('b');
    expect(sorted.map(k => k.name)).toContain('standalone');
  });
});

describe('resolveKitDependencies', () => {
  it('returns just the requested kit when it has no parents', () => {
    const all = [mkKit('gamedev')];
    expect(resolveKitDependencies(['gamedev'], all).sort()).toEqual(['gamedev']);
  });

  it('pulls in a direct parent', () => {
    const all = [mkKit('godot', ['gamedev']), mkKit('gamedev')];
    expect(resolveKitDependencies(['godot'], all).sort()).toEqual(['gamedev', 'godot']);
  });

  it('pulls in transitive ancestors', () => {
    const all = [
      mkKit('godot_2d', ['godot']),
      mkKit('godot', ['gamedev']),
      mkKit('gamedev'),
    ];
    expect(resolveKitDependencies(['godot_2d'], all).sort()).toEqual([
      'gamedev', 'godot', 'godot_2d',
    ]);
  });

  it('deduplicates overlapping parents across multiple requested kits', () => {
    const all = [
      mkKit('godot', ['gamedev']),
      mkKit('web'),
      mkKit('gamedev'),
    ];
    expect(resolveKitDependencies(['godot', 'web'], all).sort()).toEqual([
      'gamedev', 'godot', 'web',
    ]);
  });

  it('drops requests for unknown kits silently', () => {
    const all = [mkKit('gamedev')];
    expect(resolveKitDependencies(['gamedev', 'unknown'], all).sort()).toEqual(['gamedev']);
  });
});

describe('detectKitDependencyIssues', () => {
  it('returns empty for a valid graph', () => {
    const kits = [mkKit('godot', ['gamedev']), mkKit('gamedev')];
    expect(detectKitDependencyIssues(kits)).toEqual([]);
  });

  it('flags a missing parent', () => {
    const kits = [mkKit('godot', ['gamedev'])];
    const issues = detectKitDependencyIssues(kits);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/godot.*unknown kit.*gamedev/);
  });

  it('flags a self-reference', () => {
    const kits = [mkKit('loop', ['loop'])];
    const issues = detectKitDependencyIssues(kits);
    expect(issues.some(i => /references itself/.test(i))).toBe(true);
  });

  it('flags a direct cycle', () => {
    const kits = [mkKit('a', ['b']), mkKit('b', ['a'])];
    const issues = detectKitDependencyIssues(kits);
    expect(issues.some(i => /cycle/.test(i))).toBe(true);
  });

  it('flags a longer cycle', () => {
    const kits = [mkKit('a', ['b']), mkKit('b', ['c']), mkKit('c', ['a'])];
    const issues = detectKitDependencyIssues(kits);
    expect(issues.some(i => /cycle/.test(i))).toBe(true);
  });
});

describe('loadAllKits → KitRegistry with extends_kits', () => {
  it('registers parent kits before children so children override keywords', () => {
    // Simulate two kit YAMLs via parseKitYaml, then feed through a
    // registry in the same order loadAllKits would produce.
    const parent = parseKitYaml(
      'kit: parent\nversion: 1.0.0\nkeywords:\n  - shared\n'
    )!;
    const child = parseKitYaml(
      'kit: child\nversion: 1.0.0\nextends_kits:\n  - parent\nkeywords:\n  - shared\n'
    )!;

    // loadAllKits' sort order: parent first, child second.
    const ordered = topoSortKits([child, parent]);
    expect(ordered.map(k => k.name)).toEqual(['parent', 'child']);

    const registry = new KitRegistry();
    for (const k of ordered) registry.addKit(k);
    // Child registered second, so its keyword mapping wins.
    expect(registry.getKitForKeyword('shared')).toBe('child');
  });
});
