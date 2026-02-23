import * as fs from 'fs';
import * as path from 'path';
import type { AgentConfig, AgentId, InstallResult } from './types.js';
import { getAgentConfig } from './configs.js';

/**
 * The directory where template command files live.
 * Resolved relative to the CLI package root.
 */
function getTemplatesDir(): string {
  // Walk up from dist/agents/ to find the monorepo root, then templates/commands/
  // In production: packages/gist-cli/dist/agents/registrar.js
  // Template dir: templates/commands/
  let dir = __dirname;
  // Walk up until we find templates/commands/ or hit the filesystem root
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'templates', 'commands');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: relative to package
  return path.resolve(__dirname, '../../../../templates/commands');
}

/**
 * List available command template names.
 */
export function listTemplates(): string[] {
  const templatesDir = getTemplatesDir();
  if (!fs.existsSync(templatesDir)) return [];

  return fs.readdirSync(templatesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

/**
 * Install slash command skills for a given agent into a project directory.
 */
export function installSkills(agentId: AgentId, projectDir: string): InstallResult {
  const config = getAgentConfig(agentId);
  const templatesDir = getTemplatesDir();
  const result: InstallResult = {
    agent: config.name,
    installed: [],
    skipped: [],
    errors: [],
  };

  if (!fs.existsSync(templatesDir)) {
    result.errors.push(`Templates directory not found: ${templatesDir}`);
    return result;
  }

  const targetDir = path.join(projectDir, config.skillDir);

  // Create target directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Read all template files
  const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));

  for (const templateFile of templateFiles) {
    const commandName = templateFile.replace(/\.md$/, '');
    const targetFileName = `${commandName}${config.fileExtension}`;
    const targetPath = path.join(targetDir, targetFileName);

    // Read template
    let content: string;
    try {
      content = fs.readFileSync(path.join(templatesDir, templateFile), 'utf-8');
    } catch (err) {
      result.errors.push(`Failed to read template: ${templateFile}`);
      continue;
    }

    // Transform content if agent requires it
    if (config.transformContent) {
      content = config.transformContent(content, commandName);
    }

    // Write skill file
    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      result.installed.push(commandName);
    } catch (err) {
      result.errors.push(`Failed to write: ${targetPath}`);
    }
  }

  return result;
}

/**
 * Uninstall skills for a given agent from a project directory.
 */
export function uninstallSkills(agentId: AgentId, projectDir: string): string[] {
  const config = getAgentConfig(agentId);
  const targetDir = path.join(projectDir, config.skillDir);
  const removed: string[] = [];

  if (!fs.existsSync(targetDir)) return removed;

  const templates = listTemplates();
  for (const commandName of templates) {
    const targetFileName = `${commandName}${config.fileExtension}`;
    const targetPath = path.join(targetDir, targetFileName);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      removed.push(commandName);
    }
  }

  // Remove directory if empty
  try {
    const remaining = fs.readdirSync(targetDir);
    if (remaining.length === 0) {
      fs.rmdirSync(targetDir);
    }
  } catch {
    // Ignore cleanup errors
  }

  return removed;
}

/**
 * List installed skills for a given agent in a project directory.
 */
export function listInstalledSkills(agentId: AgentId, projectDir: string): string[] {
  const config = getAgentConfig(agentId);
  const targetDir = path.join(projectDir, config.skillDir);

  if (!fs.existsSync(targetDir)) return [];

  return fs.readdirSync(targetDir)
    .filter(f => f.startsWith('gist.') && f.endsWith(config.fileExtension))
    .map(f => f.replace(new RegExp(`\\${config.fileExtension}$`), ''));
}

/**
 * Detect which agent(s) are already configured in a project directory.
 */
export function detectAgents(projectDir: string): AgentId[] {
  const detected: AgentId[] = [];
  const allIds: AgentId[] = ['claude-code', 'cursor', 'copilot', 'windsurf', 'gemini', 'generic'];

  for (const id of allIds) {
    const config = getAgentConfig(id);
    const targetDir = path.join(projectDir, config.skillDir);
    if (fs.existsSync(targetDir)) {
      const gistFiles = fs.readdirSync(targetDir).filter(f => f.startsWith('gist.'));
      if (gistFiles.length > 0) {
        detected.push(id);
      }
    }
  }

  return detected;
}
