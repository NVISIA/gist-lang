import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_IDS } from '../agents/types.js';
import type { AgentId } from '../agents/types.js';
import { getAgentConfig } from '../agents/configs.js';
import { installSkills } from '../agents/registrar.js';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('Scaffold a new GIST project')
    .option('--language <lang>', 'primary language (e.g. typescript, python)')
    .option('--kit <kits...>', 'kits to include (e.g. api, web)')
    .option('--agent <name>', `AI agent to install skills for (${AGENT_IDS.join(', ')})`)
    .action((name: string | undefined, opts: { language?: string; kit?: string[]; agent?: string }) => {
      runInit(name, opts);
    });
}

function runInit(
  name: string | undefined,
  opts: { language?: string; kit?: string[]; agent?: string },
): void {
  const projectName = name ?? path.basename(process.cwd());
  const targetDir = name ? path.resolve(process.cwd(), name) : process.cwd();

  // Create directory if needed
  if (name && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log('');

  // Generate gist.yaml
  const yamlLines: string[] = [`project: ${projectName}`];
  if (opts.language) {
    yamlLines.push('', 'runtime:', `  language: ${opts.language}`);
  }
  if (opts.kit && opts.kit.length > 0) {
    yamlLines.push('', '# Kits declared here should match the "kit:" line in your .gist files');
  }
  yamlLines.push('');

  const yamlPath = path.join(targetDir, 'gist.yaml');
  if (!fs.existsSync(yamlPath)) {
    fs.writeFileSync(yamlPath, yamlLines.join('\n'), 'utf-8');
    console.log(`  ${GREEN}+${RESET} ${path.relative(process.cwd(), yamlPath)}`);
  } else {
    console.log(`  ${DIM}skip${RESET} gist.yaml (already exists)`);
  }

  // Generate starter .gist file
  const gistLines: string[] = [
    `project ${projectName}`,
  ];
  if (opts.kit && opts.kit.length > 0) {
    gistLines.push(`  kit: ${opts.kit.join(', ')}`);
  }
  gistLines.push(
    '',
    '// Define your models',
    '// User = {',
    '//   name: string',
    '//   email: string',
    '// }',
    '',
    '// Define your modules',
    '// module app',
    '//   > Main application module',
    '//',
    '//   to hello(name: string) -> string',
    '//     do:',
    '//       return greeting',
    '',
  );

  const gistPath = path.join(targetDir, `${projectName}.gist`);
  if (!fs.existsSync(gistPath)) {
    fs.writeFileSync(gistPath, gistLines.join('\n'), 'utf-8');
    console.log(`  ${GREEN}+${RESET} ${path.relative(process.cwd(), gistPath)}`);
  } else {
    console.log(`  ${DIM}skip${RESET} ${projectName}.gist (already exists)`);
  }

  // Install agent skills
  if (opts.agent) {
    if (!AGENT_IDS.includes(opts.agent as AgentId)) {
      console.error(`\n\x1b[31merror\x1b[0m Unknown agent "${opts.agent}". Supported: ${AGENT_IDS.join(', ')}`);
      process.exit(1);
    }

    const agentId = opts.agent as AgentId;
    const result = installSkills(agentId, targetDir);
    const config = getAgentConfig(agentId);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`  \x1b[31m!\x1b[0m ${err}`);
      }
    } else {
      for (const name of result.installed) {
        console.log(`  ${GREEN}+${RESET} ${config.skillDir}/${name}${config.fileExtension}`);
      }
    }
  }

  console.log('');
  console.log(`${GREEN}✓${RESET} Project "${projectName}" initialized.`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit ${BOLD}${path.relative(process.cwd(), gistPath)}${RESET} to define your spec`);
  console.log(`  2. Run ${BOLD}gist check${RESET} to validate`);

  if (opts.agent) {
    const agentId = opts.agent as AgentId;
    const config = getAgentConfig(agentId);
    console.log(`  3. Use ${BOLD}/${CYAN}gist.generate${RESET} in ${config.name} to generate code`);
  } else {
    console.log(`  3. Run ${BOLD}gist skills install --agent <name>${RESET} to install AI agent skills`);
    console.log(`     Supported: ${AGENT_IDS.join(', ')}`);
  }
}
