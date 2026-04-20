import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  discoverWorkspace,
  loadKit,
  loadAllKits,
  KitRegistry,
} from '@gist-lang/workspace';
import type { LoadedKit } from '@gist-lang/workspace';
import { validateKit, validateKitGraph } from '../kit/validator.js';
import type { KitValidationResult } from '../kit/validator.js';
import { scaffoldKit } from '../kit/scaffolder.js';
import { listBuiltinKitDirs, findBuiltinKit } from '../kit/builtins.js';

export function registerKitCommand(program: Command): void {
  const kit = program
    .command('kit')
    .description('Manage GIST kits (language extensions)');

  // ─── gist kit list ─────────────────────────────────────
  kit
    .command('list')
    .description('List available and installed kits')
    .option('--json', 'output as JSON')
    .action((opts: { json?: boolean }) => {
      runKitList(opts);
    });

  // ─── gist kit install ──────────────────────────────────
  kit
    .command('install <source>')
    .description('Install a kit into the project (by name or path)')
    .action((source: string) => {
      const exitCode = runKitInstall(source);
      process.exit(exitCode);
    });

  // ─── gist kit create ───────────────────────────────────
  kit
    .command('create <name>')
    .description('Scaffold a new custom kit')
    .option('--dir <dir>', 'target directory (default: kits/<name>)')
    .action((name: string, opts: { dir?: string }) => {
      const exitCode = runKitCreate(name, opts);
      process.exit(exitCode);
    });

  // ─── gist kit validate ─────────────────────────────────
  kit
    .command('validate [path]')
    .description('Validate a kit.yaml for correctness')
    .option('--json', 'output as JSON')
    .action((kitPath: string | undefined, opts: { json?: boolean }) => {
      const exitCode = runKitValidate(kitPath, opts);
      process.exit(exitCode);
    });
}

// ─── List ──────────────────────────────────────────────────

function runKitList(opts: { json?: boolean }): void {
  const rootDir = process.cwd();
  const workspace = discoverWorkspace(rootDir);

  // Merge workspace-discovered kits with built-in kits from the CLI package.
  // Workspace kits take priority; built-in kits fill in any gaps.
  const workspaceKits = loadAllKits(workspace.kitDirs);
  const workspaceKitNames = new Set(workspaceKits.map(k => k.name));

  const builtinDirs = listBuiltinKitDirs();
  const builtinKits = loadAllKits(builtinDirs)
    .filter(k => !workspaceKitNames.has(k.name));

  const kits = [...workspaceKits, ...builtinKits];

  if (opts.json) {
    const output = kits.map(kit => ({
      name: kit.name,
      version: kit.version,
      description: kit.description ?? '',
      keywords: kit.keywords,
      extends: kit.extends,
      extends_kits: kit.extendsKits,
      constructs: [...kit.constructs.keys()],
      yamlSections: Object.keys(kit.yamlSections),
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (kits.length === 0) {
    console.log('No kits found. Built-in kits are in the kits/ directory.');
    console.log('Create a custom kit with: gist kit create <name>');
    return;
  }

  console.log(`\x1b[1mAvailable kits\x1b[0m (${kits.length}):\n`);

  for (const kit of kits) {
    const keywords = kit.keywords.length > 0
      ? `  keywords: ${kit.keywords.join(', ')}`
      : '';
    const constructs = kit.constructs.size > 0
      ? `  constructs: ${[...kit.constructs.keys()].join(', ')}`
      : '';
    const extendsLine = kit.extends.length > 0
      ? `  extends: ${kit.extends.join(', ')}`
      : '';
    const extendsKitsLine = kit.extendsKits.length > 0
      ? `  extends_kits: ${kit.extendsKits.join(', ')}`
      : '';

    console.log(`  \x1b[36m${kit.name}\x1b[0m v${kit.version}`);
    if (kit.description) {
      console.log(`    ${kit.description}`);
    }
    if (keywords) console.log(`    ${keywords}`);
    if (constructs) console.log(`    ${constructs}`);
    if (extendsLine) console.log(`    ${extendsLine}`);
    if (extendsKitsLine) console.log(`    ${extendsKitsLine}`);
    console.log('');
  }
}

// ─── Install ───────────────────────────────────────────────

function runKitInstall(source: string): number {
  const rootDir = process.cwd();
  const localKitsDir = path.join(rootDir, 'kits');

  // 1. Resolve source — could be a name (built-in) or a path
  let sourceDir: string | undefined;

  // Check if source is a direct path to a kit directory
  const absoluteSource = path.resolve(rootDir, source);
  if (fs.existsSync(path.join(absoluteSource, 'kit.yaml'))) {
    sourceDir = absoluteSource;
  } else {
    // Look for kit by name in workspace-discovered kits
    const workspace = discoverWorkspace(rootDir);
    for (const kitDir of workspace.kitDirs) {
      const kit = loadKit(kitDir);
      if (kit?.name === source) {
        sourceDir = kitDir;
        break;
      }
    }

    // Fall back to built-in kits bundled with the CLI package
    if (!sourceDir) {
      const builtinDir = findBuiltinKit(source);
      if (builtinDir) {
        sourceDir = builtinDir;
      }
    }
  }

  if (!sourceDir) {
    console.error(`\x1b[31merror\x1b[0m: Kit not found: ${source}`);
    console.error('Provide a kit name (from built-in kits) or a path to a kit directory.');
    console.error('Run "gist kit list" to see available kits.');
    return 1;
  }

  // 2. Load and validate source kit
  const kit = loadKit(sourceDir);
  if (!kit) {
    console.error(`\x1b[31merror\x1b[0m: Failed to parse kit.yaml in ${sourceDir}`);
    return 1;
  }

  // 3. Copy kit to local kits/ directory
  const targetDir = path.join(localKitsDir, kit.name);

  if (fs.existsSync(targetDir)) {
    console.log(`\x1b[33mwarning\x1b[0m: Kit "${kit.name}" already exists at ${path.relative(rootDir, targetDir)}`);
    console.log('  Overwriting...');
  }

  copyDir(sourceDir, targetDir);

  console.log(`\x1b[32m✓\x1b[0m Kit "${kit.name}" installed to ${path.relative(rootDir, targetDir)}`);
  console.log(`  ${kit.keywords.length} keywords, ${kit.constructs.size} constructs`);

  // 4. Remind to add to gist.yaml
  console.log('');
  console.log('Add it to your gist.yaml:');
  console.log(`  kit: ${kit.name}`);

  return 0;
}

/**
 * Recursively copy a directory.
 */
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Create ────────────────────────────────────────────────

function runKitCreate(name: string, opts: { dir?: string }): number {
  const rootDir = process.cwd();
  const targetDir = opts.dir
    ? path.resolve(rootDir, opts.dir)
    : path.join(rootDir, 'kits', name);

  if (fs.existsSync(path.join(targetDir, 'kit.yaml'))) {
    console.error(`\x1b[31merror\x1b[0m: Kit already exists at ${path.relative(rootDir, targetDir)}`);
    console.error('Remove it first or choose a different name.');
    return 1;
  }

  scaffoldKit(name, targetDir);

  const relPath = path.relative(rootDir, targetDir);
  console.log(`\x1b[32m✓\x1b[0m Kit "${name}" created at ${relPath}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit ${relPath}/kit.yaml to define keywords and constructs`);
  console.log(`  2. Edit ${relPath}/KIT.md to write interpretation rules`);
  console.log(`  3. Run \x1b[36mgist kit validate ${relPath}\x1b[0m to check it`);
  console.log(`  4. Add \x1b[36mkit: ${name}\x1b[0m to your gist.yaml`);

  return 0;
}

// ─── Validate ──────────────────────────────────────────────

function runKitValidate(kitPath: string | undefined, opts: { json?: boolean }): number {
  const rootDir = process.cwd();

  // Determine which kit(s) to validate
  let kitDirs: string[];
  if (kitPath) {
    const absPath = path.resolve(rootDir, kitPath);
    if (!fs.existsSync(path.join(absPath, 'kit.yaml'))) {
      console.error(`\x1b[31merror\x1b[0m: No kit.yaml found in ${kitPath}`);
      return 1;
    }
    kitDirs = [absPath];
  } else {
    // Validate all discovered kits
    const workspace = discoverWorkspace(rootDir);
    kitDirs = workspace.kitDirs;
    if (kitDirs.length === 0) {
      console.log('No kits found to validate.');
      return 0;
    }
  }

  let hasErrors = false;
  const allResults: KitValidationResult[] = [];

  for (const kitDir of kitDirs) {
    const result = validateKit(kitDir);
    allResults.push(result);
    if (result.errors.length > 0) hasErrors = true;
  }

  // Cross-kit graph checks (missing extends_kits parents, cycles) only
  // make sense when the user asked us to validate everything we can see.
  const graphIssues: string[] = [];
  if (!kitPath) {
    const loaded = loadAllKits(kitDirs);
    graphIssues.push(...validateKitGraph(loaded));
    if (graphIssues.length > 0) hasErrors = true;
  }

  if (opts.json) {
    console.log(JSON.stringify({ results: allResults, graphIssues }, null, 2));
    return hasErrors ? 1 : 0;
  }

  for (const result of allResults) {
    const relPath = path.relative(rootDir, result.kitDir);
    const label = result.kitName ? `${result.kitName} (${relPath})` : relPath;

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log(`\x1b[32m✓\x1b[0m ${label} — valid`);
      continue;
    }

    console.log(`\x1b[1m${label}\x1b[0m`);

    for (const error of result.errors) {
      console.log(`  \x1b[31m✗ error\x1b[0m: ${error}`);
    }
    for (const warning of result.warnings) {
      console.log(`  \x1b[33m⚠ warning\x1b[0m: ${warning}`);
    }
    console.log('');
  }

  if (graphIssues.length > 0) {
    console.log(`\x1b[1mKit dependency graph\x1b[0m`);
    for (const issue of graphIssues) {
      console.log(`  \x1b[31m✗ error\x1b[0m: ${issue}`);
    }
    console.log('');
  }

  if (hasErrors) {
    const errorCount = allResults.reduce((sum, r) => sum + r.errors.length, 0) + graphIssues.length;
    console.log(`\x1b[31m✗\x1b[0m ${errorCount} error${errorCount !== 1 ? 's' : ''} found.`);
    return 1;
  }

  const total = allResults.length;
  console.log(`\x1b[32m✓\x1b[0m ${total} kit${total !== 1 ? 's' : ''} validated.`);
  return 0;
}
