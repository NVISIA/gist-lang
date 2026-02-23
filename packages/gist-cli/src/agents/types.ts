/**
 * Configuration for an AI coding agent's skill installation.
 */
export interface AgentConfig {
  /** Display name of the agent. */
  name: string;
  /** Short identifier used in CLI flags. */
  id: string;
  /** Relative path from project root where skills are installed. */
  skillDir: string;
  /** File extension for skill files (e.g., '.md'). */
  fileExtension: string;
  /**
   * Transform applied to template content before writing.
   * Some agents require specific frontmatter formats or structure.
   */
  transformContent?: (templateContent: string, commandName: string) => string;
}

/**
 * Result of installing skills for an agent.
 */
export interface InstallResult {
  agent: string;
  installed: string[];
  skipped: string[];
  errors: string[];
}

/**
 * All supported agent identifiers.
 */
export type AgentId = 'claude-code' | 'cursor' | 'copilot' | 'windsurf' | 'gemini' | 'generic';

export const AGENT_IDS: AgentId[] = ['claude-code', 'cursor', 'copilot', 'windsurf', 'gemini', 'generic'];
