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
  };

  return kit;
}

/**
 * Load all kits from an array of kit directories.
 */
export function loadAllKits(kitDirs: string[]): LoadedKit[] {
  const kits: LoadedKit[] = [];
  for (const dir of kitDirs) {
    const kit = loadKit(dir);
    if (kit) {
      kits.push(kit);
    }
  }
  return kits;
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
