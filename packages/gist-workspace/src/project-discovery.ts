import * as fs from 'fs';
import * as path from 'path';
import type { WorkspaceInfo } from './types.js';

/**
 * Discovers a GIST workspace from a root directory.
 * Finds gist.yaml, all .gist files, and kit directories.
 */
export function discoverWorkspace(rootPath: string): WorkspaceInfo {
  const info: WorkspaceInfo = {
    rootPath,
    gistFiles: [],
    kitDirs: [],
  };

  // Look for gist.yaml in workspace root
  const gistYamlPath = path.join(rootPath, 'gist.yaml');
  if (fs.existsSync(gistYamlPath)) {
    info.gistYamlPath = gistYamlPath;
  }

  // Find all .gist files recursively (skip node_modules, dist, .git)
  info.gistFiles = findFiles(rootPath, '.gist', ['node_modules', 'dist', '.git', 'target']);

  // Find kit directories
  // 1. Built-in kits: look for kits/ in workspace root and up to 3 parent dirs
  const builtinKitsDir = findKitsDir(rootPath);
  if (builtinKitsDir) {
    const kitNames = listSubdirs(builtinKitsDir);
    for (const name of kitNames) {
      const kitDir = path.join(builtinKitsDir, name);
      if (fs.existsSync(path.join(kitDir, 'kit.yaml'))) {
        info.kitDirs.push(kitDir);
      }
    }
  }

  // 2. Local kits: look for kits/ in workspace root
  const localKitsDir = path.join(rootPath, 'kits');
  if (fs.existsSync(localKitsDir) && localKitsDir !== builtinKitsDir) {
    const kitNames = listSubdirs(localKitsDir);
    for (const name of kitNames) {
      const kitDir = path.join(localKitsDir, name);
      if (fs.existsSync(path.join(kitDir, 'kit.yaml'))) {
        info.kitDirs.push(kitDir);
      }
    }
  }

  return info;
}

/**
 * Find .gist files recursively under a root directory.
 */
function findFiles(dir: string, ext: string, skipDirs: string[]): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          results.push(...findFiles(path.join(dir, entry.name), ext, skipDirs));
        }
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // Permission denied or other fs error — skip
  }

  return results;
}

/**
 * Search for a kits/ directory starting from rootPath and walking up.
 */
function findKitsDir(rootPath: string): string | undefined {
  let current = rootPath;
  for (let i = 0; i < 4; i++) {
    const kitsDir = path.join(current, 'kits');
    if (fs.existsSync(kitsDir) && fs.statSync(kitsDir).isDirectory()) {
      return kitsDir;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }
  return undefined;
}

/**
 * List immediate subdirectory names.
 */
function listSubdirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}
