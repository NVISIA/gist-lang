import type { AgentConfig, AgentId } from './types.js';

/**
 * Strip YAML frontmatter from template content.
 */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}

/**
 * Convert YAML frontmatter to Cursor-style metadata comment.
 */
function toCursorFormat(content: string, commandName: string): string {
  // Cursor uses .mdc files with frontmatter in a different format
  // Strip our YAML frontmatter and add a description comment
  const body = stripFrontmatter(content);
  return `---\ndescription: GIST ${commandName} skill\nglobs:\nalwaysApply: false\n---\n${body}`;
}

/**
 * Convert to Copilot instructions format.
 */
function toCopilotFormat(content: string, commandName: string): string {
  // Copilot reads markdown instructions from .github/copilot-instructions.md
  // or individual files in .github/instructions/
  const body = stripFrontmatter(content);
  return `<!-- GIST Skill: ${commandName} -->\n${body}`;
}

const configs: Record<AgentId, AgentConfig> = {
  'claude-code': {
    name: 'Claude Code',
    id: 'claude-code',
    skillDir: '.claude/commands',
    fileExtension: '.md',
  },

  'cursor': {
    name: 'Cursor',
    id: 'cursor',
    skillDir: '.cursor/rules',
    fileExtension: '.mdc',
    transformContent: toCursorFormat,
  },

  'copilot': {
    name: 'GitHub Copilot',
    id: 'copilot',
    skillDir: '.github/instructions',
    fileExtension: '.md',
    transformContent: toCopilotFormat,
  },

  'windsurf': {
    name: 'Windsurf',
    id: 'windsurf',
    skillDir: '.windsurf/rules',
    fileExtension: '.md',
  },

  'gemini': {
    name: 'Gemini CLI',
    id: 'gemini',
    skillDir: '.gemini/commands',
    fileExtension: '.md',
  },

  'generic': {
    name: 'Generic',
    id: 'generic',
    skillDir: '.gist/commands',
    fileExtension: '.md',
  },
};

export function getAgentConfig(id: AgentId): AgentConfig {
  return configs[id];
}

export function getAllAgentConfigs(): AgentConfig[] {
  return Object.values(configs);
}
