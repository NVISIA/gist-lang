import * as fs from 'fs';
import * as path from 'path';
import {
  discoverWorkspace,
  loadAllKits,
} from '@gist-lang/workspace';
import type { WorkspaceInfo } from '@gist-lang/workspace';

export interface BundleOptions {
  /** Project root directory. */
  rootDir: string;
  /** Whether to include the GIST-interpreter.md spec. */
  includeInterpreterSpec: boolean;
}

export interface BundleSection {
  label: string;
  path?: string;
  content: string;
}

/**
 * Assemble all project inputs into a structured prompt bundle.
 */
export function assembleBundle(opts: BundleOptions): BundleSection[] {
  const sections: BundleSection[] = [];
  const workspace = discoverWorkspace(opts.rootDir);

  // 1. Interpreter spec
  if (opts.includeInterpreterSpec) {
    const specPath = findInterpreterSpec(opts.rootDir);
    if (specPath) {
      sections.push({
        label: 'GIST Interpreter Specification',
        path: path.relative(opts.rootDir, specPath),
        content: fs.readFileSync(specPath, 'utf-8'),
      });
    }
  }

  // 2. gist.yaml
  if (workspace.gistYamlPath) {
    sections.push({
      label: 'Project Manifest (gist.yaml)',
      path: path.relative(opts.rootDir, workspace.gistYamlPath),
      content: fs.readFileSync(workspace.gistYamlPath, 'utf-8'),
    });
  }

  // 3. Kit files
  const kits = loadAllKits(workspace.kitDirs);
  for (const kit of kits) {
    // Find the kit directory to load KIT.md
    for (const kitDir of workspace.kitDirs) {
      const kitYamlPath = path.join(kitDir, 'kit.yaml');
      if (fs.existsSync(kitYamlPath)) {
        const kitYamlContent = fs.readFileSync(kitYamlPath, 'utf-8');
        if (kitYamlContent.includes(`kit: ${kit.name}`)) {
          // Add kit.yaml
          sections.push({
            label: `Kit: ${kit.name} (kit.yaml)`,
            path: path.relative(opts.rootDir, kitYamlPath),
            content: kitYamlContent,
          });

          // Add KIT.md if it exists
          const kitMdPath = path.join(kitDir, 'KIT.md');
          if (fs.existsSync(kitMdPath)) {
            sections.push({
              label: `Kit: ${kit.name} (KIT.md)`,
              path: path.relative(opts.rootDir, kitMdPath),
              content: fs.readFileSync(kitMdPath, 'utf-8'),
            });
          }
          break;
        }
      }
    }
  }

  // 4. All .gist files
  for (const gistFile of workspace.gistFiles) {
    sections.push({
      label: `Spec: ${path.basename(gistFile)}`,
      path: path.relative(opts.rootDir, gistFile),
      content: fs.readFileSync(gistFile, 'utf-8'),
    });
  }

  return sections;
}

/**
 * Format assembled sections into a single prompt string.
 */
export function formatBundle(sections: BundleSection[]): string {
  const parts: string[] = [];

  parts.push('# GIST Project Bundle');
  parts.push('');
  parts.push('This bundle contains all inputs needed to generate code from a GIST specification.');
  parts.push('Process sections in order. Follow the interpreter specification exactly.');
  parts.push('');

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const header = section.path
      ? `## ${i + 1}. ${section.label} (\`${section.path}\`)`
      : `## ${i + 1}. ${section.label}`;

    parts.push(header);
    parts.push('');
    // Wrap in code fences for clarity
    const lang = section.path?.endsWith('.yaml') || section.path?.endsWith('.yml')
      ? 'yaml'
      : section.path?.endsWith('.gist')
        ? 'gist'
        : section.path?.endsWith('.md')
          ? 'markdown'
          : '';
    parts.push(`\`\`\`${lang}`);
    parts.push(section.content.trimEnd());
    parts.push('```');
    parts.push('');
  }

  parts.push('---');
  parts.push('');
  parts.push('Generate a complete, buildable project from the specification above.');

  return parts.join('\n');
}

/**
 * Find the GIST interpreter spec file.
 */
function findInterpreterSpec(rootDir: string): string | null {
  const candidates = [
    path.join(rootDir, 'spec', 'GIST-interpreter.md'),
    path.join(rootDir, 'GIST-interpreter.md'),
  ];

  // Also check parent directories (for when running inside examples/)
  let dir = rootDir;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    candidates.push(path.join(parent, 'spec', 'GIST-interpreter.md'));
    dir = parent;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
