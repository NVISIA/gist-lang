import * as fs from 'fs';
import * as path from 'path';
import { loadKit } from '@gist-lang/workspace';
import type { LoadedKit, KitConstruct } from '@gist-lang/workspace';

/**
 * Result of validating a kit directory.
 */
export interface KitValidationResult {
  kitDir: string;
  kitName: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Core GIST declaration-level keywords that kits must not override.
 * Note: Clause keywords (route:, saves:, do:, etc.) are NOT included here
 * because they are used inside declarations with ':' suffix and can coexist
 * with kit keywords at the declaration level (e.g., web kit's `route` keyword).
 */
const CORE_KEYWORDS = new Set([
  // Declarations — top-level structural keywords
  'project', 'module', 'model', 'trait', 'type', 'state', 'test', 'extend',
  // Intent / function / flow declarations
  'to', 'fn', 'flow', 'on',
  // Modifiers
  'public', 'async', 'trace',
  // Type system primitives
  'string', 'int', 'float', 'bool', 'date', 'datetime', 'email', 'url', 'uuid',
  'void', 'error',
  // Built-in field modifiers
  'generated', 'unique', 'optional', 'required',
]);

/**
 * Validate a kit directory for structural correctness and best practices.
 */
export function validateKit(kitDir: string): KitValidationResult {
  const result: KitValidationResult = {
    kitDir,
    kitName: null,
    errors: [],
    warnings: [],
  };

  // 1. Check kit.yaml exists
  const kitYamlPath = path.join(kitDir, 'kit.yaml');
  if (!fs.existsSync(kitYamlPath)) {
    result.errors.push('Missing kit.yaml file');
    return result;
  }

  // 2. Try to parse kit.yaml
  const kit = loadKit(kitDir);
  if (!kit) {
    result.errors.push('Failed to parse kit.yaml — check YAML syntax');
    return result;
  }

  result.kitName = kit.name;

  // 3. Validate required fields
  validateRequiredFields(kit, result);

  // 4. Validate keywords
  validateKeywords(kit, result);

  // 5. Validate constructs
  validateConstructs(kit, result);

  // 6. Validate YAML sections
  validateYamlSections(kit, result);

  // 7. Check for KIT.md
  const kitMdPath = path.join(kitDir, 'KIT.md');
  if (!fs.existsSync(kitMdPath)) {
    result.warnings.push('Missing KIT.md file — add interpretation rules for AI agents');
  }

  return result;
}

function validateRequiredFields(kit: LoadedKit, result: KitValidationResult): void {
  if (!kit.name || kit.name.trim() === '') {
    result.errors.push('Missing "kit:" field — must specify a kit name');
  }

  if (kit.name && !/^[a-z][a-z0-9_-]*$/.test(kit.name)) {
    result.errors.push(
      `Kit name "${kit.name}" is invalid — use lowercase letters, numbers, hyphens, underscores`
    );
  }

  if (kit.version === '0.0.0') {
    result.warnings.push('Missing "version:" field — add a semantic version (e.g., 1.0.0)');
  }

  if (!kit.description) {
    result.warnings.push('Missing "description:" field — describe what this kit provides');
  }

  if (kit.keywords.length === 0 && kit.constructs.size === 0) {
    result.errors.push('Kit must define at least one keyword or construct');
  }
}

function validateKeywords(kit: LoadedKit, result: KitValidationResult): void {
  for (const keyword of kit.keywords) {
    // Check for conflicts with core GIST keywords
    if (CORE_KEYWORDS.has(keyword)) {
      result.errors.push(
        `Keyword "${keyword}" conflicts with a core GIST keyword — choose a different name`
      );
    }

    // Check naming convention
    if (!/^[a-z][a-z0-9_]*$/.test(keyword)) {
      result.warnings.push(
        `Keyword "${keyword}" should use snake_case (lowercase letters, numbers, underscores)`
      );
    }
  }

  // Check for duplicate keywords
  const seen = new Set<string>();
  for (const keyword of kit.keywords) {
    if (seen.has(keyword)) {
      result.warnings.push(`Duplicate keyword "${keyword}" in keywords list`);
    }
    seen.add(keyword);
  }
}

function validateConstructs(kit: LoadedKit, result: KitValidationResult): void {
  for (const [keyword, construct] of kit.constructs) {
    // Check construct keyword isn't core
    if (CORE_KEYWORDS.has(keyword)) {
      result.errors.push(
        `Construct "${keyword}" conflicts with a core GIST keyword — choose a different name`
      );
    }

    // Validate kind
    if (!['declaration', 'inline', 'block'].includes(construct.kind)) {
      result.errors.push(
        `Construct "${keyword}" has invalid kind "${construct.kind}" — must be declaration, inline, or block`
      );
    }

    // Check for doc field
    if (!construct.doc || construct.doc.trim() === '') {
      result.warnings.push(
        `Construct "${keyword}" has no "doc:" field — add a description for hover/completions`
      );
    }

    // Validate name_style
    if (!['identifier', 'PascalCase', 'none'].includes(construct.nameStyle)) {
      result.warnings.push(
        `Construct "${keyword}" has unexpected name_style "${construct.nameStyle}"`
      );
    }

    // Validate children references
    if (construct.children) {
      for (const child of construct.children) {
        // Children should reference either kit keywords or constructs
        const isKitKeyword = kit.keywords.includes(child) || kit.constructs.has(child);
        const isExtended = kit.extends.includes(child);
        const isCore = CORE_KEYWORDS.has(child);
        if (!isKitKeyword && !isExtended && !isCore) {
          result.warnings.push(
            `Construct "${keyword}" references unknown child "${child}" — not found in keywords, constructs, or extends`
          );
        }
      }
    }

    // Validate supports references
    if (construct.supports) {
      for (const supported of construct.supports) {
        const isKitKeyword = kit.keywords.includes(supported) || kit.constructs.has(supported);
        const isExtended = kit.extends.includes(supported);
        const isCore = CORE_KEYWORDS.has(supported);
        if (!isKitKeyword && !isExtended && !isCore) {
          result.warnings.push(
            `Construct "${keyword}" supports unknown clause "${supported}" — not found in keywords, constructs, or extends`
          );
        }
      }
    }

    // Validate fields
    validateConstructFields(keyword, construct, result);
  }

  // Check that keywords referenced in keywords[] have constructs defined
  for (const keyword of kit.keywords) {
    if (!kit.constructs.has(keyword)) {
      result.warnings.push(
        `Keyword "${keyword}" has no matching construct definition — consider adding one for IDE support`
      );
    }
  }
}

function validateConstructFields(
  keyword: string,
  construct: KitConstruct,
  result: KitValidationResult,
): void {
  for (const [fieldName, field] of Object.entries(construct.fields)) {
    if (field.values && field.values.length === 0) {
      result.warnings.push(
        `Construct "${keyword}" field "${fieldName}" has empty values array`
      );
    }
  }
}

function validateYamlSections(kit: LoadedKit, result: KitValidationResult): void {
  for (const [sectionName, section] of Object.entries(kit.yamlSections)) {
    // Check naming convention
    if (!/^[a-z][a-z0-9_]*$/.test(sectionName)) {
      result.warnings.push(
        `YAML section "${sectionName}" should use snake_case naming`
      );
    }

    // Check for fields
    if (Object.keys(section.fields).length === 0) {
      result.warnings.push(
        `YAML section "${sectionName}" has no fields defined`
      );
    }
  }
}
