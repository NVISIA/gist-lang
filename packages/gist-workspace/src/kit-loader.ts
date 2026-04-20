import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type {
  LoadedKit,
  KitConstruct,
  KitConstructField,
  KitYamlSection,
  KitYamlSectionField,
} from './types.js';

/**
 * Load a kit from a directory containing kit.yaml.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function loadKit(kitDir: string): LoadedKit | null {
  const kitYamlPath = path.join(kitDir, 'kit.yaml');
  try {
    const content = fs.readFileSync(kitYamlPath, 'utf-8');
    return parseKitYaml(content);
  } catch {
    return null;
  }
}

/**
 * Parse kit.yaml content string into a LoadedKit.
 */
export function parseKitYaml(content: string): LoadedKit | null {
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const name = asString(obj['kit']);
  if (!name) return null;

  const kit: LoadedKit = {
    name,
    version: asString(obj['version']) ?? '0.0.0',
    author: asString(obj['author']),
    description: asString(obj['description']),
    license: asString(obj['license']),
    keywords: parseStringArray(obj['keywords']),
    constructs: parseConstructs(obj['constructs']),
    yamlSections: parseYamlSections(obj['yaml_sections']),
    extends: parseStringArray(obj['extends']),
    extendsKits: parseStringArray(obj['extends_kits']),
  };

  return kit;
}

/**
 * Load all kits from an array of kit directories.
 *
 * The returned kits are topologically ordered by `extends_kits` so that a
 * parent kit always appears before any kit that extends it. When consumers
 * feed this array into `KitRegistry.addKit` in order, child kits can override
 * parent keywords/constructs (last-write-wins semantics in the registry).
 *
 * `extends_kits` references to kits that are not present in `kitDirs` are
 * silently ignored by the loader — the validator surfaces them as errors.
 * Cycles are broken by emitting the involved kits in discovery order.
 */
export function loadAllKits(kitDirs: string[]): LoadedKit[] {
  const kits: LoadedKit[] = [];
  for (const dir of kitDirs) {
    const kit = loadKit(dir);
    if (kit) {
      kits.push(kit);
    }
  }
  return topoSortKits(kits);
}

/**
 * Topologically sort kits so parents (listed in `extends_kits`) come before
 * children. Uses Kahn's algorithm; on cycle, falls back to appending the
 * remaining kits in their original order.
 */
export function topoSortKits(kits: LoadedKit[]): LoadedKit[] {
  const byName = new Map<string, LoadedKit>();
  for (const kit of kits) byName.set(kit.name, kit);

  // Build reverse edges: parent -> [children that extend it]
  const children = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const kit of kits) {
    inDegree.set(kit.name, 0);
  }
  for (const kit of kits) {
    for (const parent of kit.extendsKits) {
      if (!byName.has(parent)) continue; // unknown parent — skip edge
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(kit.name);
      inDegree.set(kit.name, (inDegree.get(kit.name) ?? 0) + 1);
    }
  }

  const ordered: LoadedKit[] = [];
  const emitted = new Set<string>();
  const queue: string[] = [];
  // Seed queue with zero-in-degree kits, preserving discovery order
  for (const kit of kits) {
    if ((inDegree.get(kit.name) ?? 0) === 0) queue.push(kit.name);
  }
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (emitted.has(name)) continue;
    emitted.add(name);
    ordered.push(byName.get(name)!);
    for (const child of children.get(name) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }
  // Anything left over is part of a cycle — append in discovery order
  for (const kit of kits) {
    if (!emitted.has(kit.name)) {
      ordered.push(kit);
    }
  }
  return ordered;
}

/**
 * Given a set of kit names a project explicitly activates, return the full
 * set of kit names that must be loaded — including transitive parents via
 * `extends_kits`. Unknown names in `requested` or unknown parent references
 * are dropped silently; use the validator for diagnostics.
 */
export function resolveKitDependencies(
  requested: readonly string[],
  allKits: readonly LoadedKit[],
): string[] {
  const byName = new Map<string, LoadedKit>();
  for (const kit of allKits) byName.set(kit.name, kit);

  const resolved = new Set<string>();
  const stack = [...requested];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (resolved.has(name)) continue;
    const kit = byName.get(name);
    if (!kit) continue;
    resolved.add(name);
    for (const parent of kit.extendsKits) {
      if (!resolved.has(parent)) stack.push(parent);
    }
  }
  return [...resolved];
}

/**
 * Detect missing `extends_kits` references and dependency cycles across a
 * set of loaded kits. Returns an array of human-readable issue strings;
 * empty when the graph is clean.
 */
export function detectKitDependencyIssues(kits: readonly LoadedKit[]): string[] {
  const issues: string[] = [];
  const byName = new Map<string, LoadedKit>();
  for (const kit of kits) byName.set(kit.name, kit);

  // Missing parents + self-references
  for (const kit of kits) {
    for (const parent of kit.extendsKits) {
      if (parent === kit.name) {
        issues.push(`Kit "${kit.name}" extends_kits references itself`);
        continue;
      }
      if (!byName.has(parent)) {
        issues.push(`Kit "${kit.name}" extends_kits references unknown kit "${parent}"`);
      }
    }
  }

  // Cycle detection (DFS with coloring)
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const kit of kits) color.set(kit.name, WHITE);
  const reported = new Set<string>();
  const visit = (name: string, stack: string[]): void => {
    const c = color.get(name);
    if (c === BLACK) return;
    if (c === GRAY) {
      const cycleKey = [...stack.slice(stack.indexOf(name)), name].sort().join(',');
      if (!reported.has(cycleKey)) {
        reported.add(cycleKey);
        const path = [...stack.slice(stack.indexOf(name)), name].join(' -> ');
        issues.push(`Kit dependency cycle detected: ${path}`);
      }
      return;
    }
    color.set(name, GRAY);
    stack.push(name);
    const kit = byName.get(name);
    if (kit) {
      for (const parent of kit.extendsKits) {
        if (byName.has(parent) && parent !== name) visit(parent, stack);
      }
    }
    stack.pop();
    color.set(name, BLACK);
  };
  for (const kit of kits) {
    if (color.get(kit.name) === WHITE) visit(kit.name, []);
  }

  return issues;
}

// ─── Internal parsers ────────────────────────────────────────

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(item => {
    if (typeof item === 'string') return item;
    // Strip trailing comments (e.g., "state  # UI state machines")
    const s = String(item);
    return s;
  });
}

function parseConstructs(v: unknown): Map<string, KitConstruct> {
  const result = new Map<string, KitConstruct>();
  const obj = asObj(v);
  if (!obj) return result;

  for (const [keyword, constructVal] of Object.entries(obj)) {
    const cObj = asObj(constructVal);
    if (!cObj) continue;

    const construct: KitConstruct = {
      kind: parseConstructKind(asString(cObj['kind'])),
      nameStyle: parseNameStyle(asString(cObj['name_style'])),
      doc: asString(cObj['doc']) ?? '',
      fields: parseConstructFields(cObj['fields']),
      children: cObj['children'] ? parseStringArray(cObj['children']) : undefined,
      supports: cObj['supports'] ? parseStringArray(cObj['supports']) : undefined,
      snippet: asString(cObj['snippet']),
    };

    result.set(keyword, construct);
  }

  return result;
}

function parseConstructKind(v: string | undefined): KitConstruct['kind'] {
  if (v === 'declaration' || v === 'inline' || v === 'block') return v;
  return 'declaration';
}

function parseNameStyle(v: string | undefined): KitConstruct['nameStyle'] {
  if (v === 'identifier' || v === 'PascalCase' || v === 'none') return v;
  return 'identifier';
}

function parseConstructFields(v: unknown): Record<string, KitConstructField> {
  const result: Record<string, KitConstructField> = {};
  const obj = asObj(v);
  if (!obj) return result;

  for (const [name, fieldVal] of Object.entries(obj)) {
    const fObj = asObj(fieldVal);
    if (!fObj) continue;

    result[name] = {
      type: asString(fObj['type']),
      doc: asString(fObj['doc']),
      required: fObj['required'] === true ? true : undefined,
      default: fObj['default'],
      values: fObj['values'] ? parseStringArray(fObj['values']) : undefined,
      completions: fObj['completions'] ? parseStringArray(fObj['completions']) : undefined,
    };
  }

  return result;
}

function parseYamlSections(v: unknown): Record<string, KitYamlSection> {
  const result: Record<string, KitYamlSection> = {};
  const obj = asObj(v);
  if (!obj) return result;

  for (const [sectionName, sectionVal] of Object.entries(obj)) {
    const sObj = asObj(sectionVal);
    if (!sObj) continue;

    result[sectionName] = {
      description: asString(sObj['description']),
      fields: parseYamlSectionFields(sObj['fields']),
    };
  }

  return result;
}

function parseYamlSectionFields(v: unknown): Record<string, KitYamlSectionField> {
  const result: Record<string, KitYamlSectionField> = {};
  const obj = asObj(v);
  if (!obj) return result;

  for (const [name, fieldVal] of Object.entries(obj)) {
    const fObj = asObj(fieldVal);
    if (!fObj) continue;

    result[name] = {
      type: asString(fObj['type']),
      required: fObj['required'] === true ? true : undefined,
      default: fObj['default'],
      values: fObj['values'] ? parseStringArray(fObj['values']) : undefined,
      // Recurse for nested fields (e.g., providers."[name]".fields)
      fields: fObj['fields'] ? parseYamlSectionFields(fObj['fields']) : undefined,
    };
  }

  return result;
}
