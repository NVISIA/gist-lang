import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve the CLI package root directory.
 * Works both in monorepo dev (dist/kit/ -> package root) and when npm-installed.
 */
function getPackageRoot(): string {
  // __dirname is dist/kit/ at runtime — go up 2 levels to reach package root
  return path.resolve(__dirname, '..', '..');
}

/**
 * Get the directory containing built-in kit definitions.
 * Checks the package-local kits/ first (works when npm-installed),
 * then falls back to walking up the directory tree (works in monorepo dev).
 *
 * @returns The path to the kits directory, or undefined if not found.
 */
export function getBuiltinKitsDir(): string | undefined {
  // 1. Check package-local kits/ (primary — works when npm-installed)
  const packageLocal = path.join(getPackageRoot(), 'kits');
  if (fs.existsSync(packageLocal) && fs.statSync(packageLocal).isDirectory()) {
    return packageLocal;
  }

  // 2. Walk up from package root to find monorepo-level kits/
  let dir = getPackageRoot();
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const candidate = path.join(dir, 'kits');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * List all built-in kit directory paths.
 * Each entry is a path to a directory containing a kit.yaml file.
 */
export function listBuiltinKitDirs(): string[] {
  const kitsDir = getBuiltinKitsDir();
  if (!kitsDir) return [];

  try {
    return fs.readdirSync(kitsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(kitsDir, e.name))
      .filter(dir => fs.existsSync(path.join(dir, 'kit.yaml')));
  } catch {
    return [];
  }
}

/**
 * Find a built-in kit directory by name.
 *
 * @param name - The kit name (e.g., "web", "api")
 * @returns Path to the kit directory, or undefined if not found.
 */
export function findBuiltinKit(name: string): string | undefined {
  const kitsDir = getBuiltinKitsDir();
  if (!kitsDir) return undefined;

  const kitDir = path.join(kitsDir, name);
  if (fs.existsSync(path.join(kitDir, 'kit.yaml'))) {
    return kitDir;
  }

  return undefined;
}
