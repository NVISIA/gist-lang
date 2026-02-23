import { Command } from 'commander';
import { AGENT_IDS } from '../agents/types.js';
import type { AgentId } from '../agents/types.js';
import { getAgentConfig, getAllAgentConfigs } from '../agents/configs.js';
import { installSkills, listInstalledSkills, listTemplates, detectAgents } from '../agents/registrar.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('Manage AI agent slash command skills');

  skills
    .command('install')
    .description('Install GIST slash command skills for an AI agent')
    .requiredOption('--agent <name>', `Agent to install for (${AGENT_IDS.join(', ')})`)
    .action((opts: { agent: string }) => {
      const agentId = validateAgentId(opts.agent);
      if (!agentId) return;

      const projectDir = process.cwd();
      const result = installSkills(agentId, projectDir);

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(`\x1b[31merror\x1b[0m ${err}`);
        }
        process.exit(1);
      }

      console.log(`${GREEN}✓${RESET} Installed ${result.installed.length} skills for ${BOLD}${result.agent}${RESET}`);
      const config = getAgentConfig(agentId);
      console.log(`  ${DIM}Location: ${config.skillDir}/${RESET}`);
      console.log('');
      for (const name of result.installed) {
        console.log(`  ${CYAN}/${name}${RESET}`);
      }
    });

  skills
    .command('list')
    .description('Show installed skills and detected agents')
    .action(() => {
      const projectDir = process.cwd();
      const detected = detectAgents(projectDir);

      if (detected.length === 0) {
        console.log('No GIST skills installed.');
        console.log(`\nRun ${BOLD}gist skills install --agent <name>${RESET} to install.`);
        console.log(`Available agents: ${AGENT_IDS.join(', ')}`);
        return;
      }

      for (const agentId of detected) {
        const config = getAgentConfig(agentId);
        const installed = listInstalledSkills(agentId, projectDir);
        console.log(`${BOLD}${config.name}${RESET} ${DIM}(${config.skillDir}/)${RESET}`);
        for (const name of installed) {
          console.log(`  ${CYAN}/${name}${RESET}`);
        }
        console.log('');
      }
    });

  skills
    .command('agents')
    .description('List all supported AI agents')
    .action(() => {
      console.log(`${BOLD}Supported AI agents:${RESET}\n`);
      for (const config of getAllAgentConfigs()) {
        console.log(`  ${BOLD}${config.id}${RESET} ${DIM}— ${config.name}, installs to ${config.skillDir}/${RESET}`);
      }
    });
}

function validateAgentId(input: string): AgentId | null {
  if (AGENT_IDS.includes(input as AgentId)) {
    return input as AgentId;
  }
  console.error(`\x1b[31merror\x1b[0m Unknown agent "${input}". Supported: ${AGENT_IDS.join(', ')}`);
  process.exit(1);
}
