import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as clack from '@clack/prompts';
import { AGENT_IDS } from '../agents/types.js';
import type { AgentId } from '../agents/types.js';
import { getAgentConfig } from '../agents/configs.js';
import { installSkills } from '../agents/registrar.js';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** Available language options for project initialization. */
const LANGUAGES = [
  { value: 'typescript', label: 'TypeScript', hint: 'recommended' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
] as const;

/** Available kit options for project initialization. */
const KITS = [
  { value: 'web', label: 'Web', hint: 'pages, layouts, components' },
  { value: 'api', label: 'API', hint: 'REST endpoints, middleware, auth' },
  { value: 'cli', label: 'CLI', hint: 'commands, flags, arguments' },
  { value: 'mobile', label: 'Mobile', hint: 'screens, navigation, gestures' },
  { value: 'iac', label: 'Infrastructure', hint: 'services, environments, scaling' },
  { value: 'gamedev', label: 'Game Dev', hint: 'scenes, entities, physics' },
] as const;

/** Available AI agent options for skill installation. */
const AGENTS: { value: AgentId | 'skip'; label: string; hint?: string }[] = [
  { value: 'claude-code', label: 'Claude Code', hint: 'recommended' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'gemini', label: 'Gemini CLI' },
  { value: 'generic', label: 'Other / Generic', hint: 'manual setup' },
  { value: 'skip', label: 'Skip for now', hint: 'install later with gist skills install' },
];

/** Available framework options grouped by language. */
const FRAMEWORKS: Record<string, { value: string; label: string }[]> = {
  typescript: [
    { value: 'nextjs', label: 'Next.js' },
    { value: 'express', label: 'Express' },
    { value: 'fastify', label: 'Fastify' },
    { value: 'astro', label: 'Astro' },
    { value: 'sveltekit', label: 'SvelteKit' },
    { value: 'none', label: 'None' },
  ],
  python: [
    { value: 'fastapi', label: 'FastAPI' },
    { value: 'django', label: 'Django' },
    { value: 'flask', label: 'Flask' },
    { value: 'none', label: 'None' },
  ],
  go: [
    { value: 'gin', label: 'Gin' },
    { value: 'echo', label: 'Echo' },
    { value: 'fiber', label: 'Fiber' },
    { value: 'none', label: 'None' },
  ],
  rust: [
    { value: 'axum', label: 'Axum' },
    { value: 'actix', label: 'Actix Web' },
    { value: 'none', label: 'None' },
  ],
  java: [
    { value: 'spring', label: 'Spring Boot' },
    { value: 'quarkus', label: 'Quarkus' },
    { value: 'none', label: 'None' },
  ],
  ruby: [
    { value: 'rails', label: 'Rails' },
    { value: 'sinatra', label: 'Sinatra' },
    { value: 'none', label: 'None' },
  ],
};

export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('Scaffold a new GIST project')
    .option('--language <lang>', 'primary language (e.g. typescript, python)')
    .option('--framework <name>', 'framework (e.g. nextjs, fastapi)')
    .option('--kit <kits...>', 'kits to include (e.g. api, web)')
    .option('--agent <name>', `AI agent to install skills for (${AGENT_IDS.join(', ')})`)
    .option('--prompt <text>', 'natural-language project description to stage for /gist.gistify')
    .option('--yes', 'skip interactive prompts and use defaults')
    .action(async (name: string | undefined, opts: {
      language?: string;
      framework?: string;
      kit?: string[];
      agent?: string;
      prompt?: string;
      yes?: boolean;
    }) => {
      const hasFlags = !!(opts.language || opts.kit || opts.agent || opts.prompt || opts.yes);
      const isInteractive = !hasFlags && process.stdin.isTTY;

      if (isInteractive) {
        await runInteractiveInit(name);
      } else {
        runInit(name, opts);
      }
    });
}

// ─── Interactive Init ─────────────────────────────────────────

async function runInteractiveInit(nameArg: string | undefined): Promise<void> {
  clack.intro('Create a new GIST project');

  const project = await clack.group(
    {
      name: () =>
        clack.text({
          message: 'Project name',
          placeholder: nameArg ?? path.basename(process.cwd()),
          defaultValue: nameArg ?? path.basename(process.cwd()),
          validate(value) {
            if (!value || value.trim().length === 0) return 'Project name is required';
            if (/[^\w\-.]/.test(value)) return 'Use only letters, numbers, hyphens, dots, and underscores';
            return undefined;
          },
        }),

      language: () =>
        clack.select({
          message: 'What language will you use?',
          options: [...LANGUAGES],
          initialValue: 'typescript' as string,
        }),

      framework: ({ results }) => {
        const lang = results.language as string;
        const options = FRAMEWORKS[lang];
        if (!options || options.length === 0) return Promise.resolve(undefined);
        return clack.select({
          message: 'Framework?',
          options,
          initialValue: options[0].value,
        });
      },

      kits: () =>
        clack.multiselect({
          message: 'Which kits do you need? (space to select)',
          options: [...KITS],
          required: false,
        }),

      agent: () =>
        clack.select({
          message: 'Which AI coding agent do you use?',
          options: AGENTS,
        }),

      prompt: () =>
        clack.text({
          message: 'Describe your project (optional, for /gist.gistify)',
          placeholder: 'e.g. a bookmark manager with tags and search',
          defaultValue: '',
        }),
    },
    {
      onCancel() {
        clack.cancel('Project creation cancelled.');
        process.exit(0);
      },
    },
  );

  const projectName = project.name as string;
  const language = project.language as string;
  const framework = project.framework as string | undefined;
  const kits = project.kits as string[];
  const agent = project.agent as AgentId | 'skip';
  const promptText = ((project.prompt as string | undefined) ?? '').trim();
  const targetDir = nameArg ? path.resolve(process.cwd(), nameArg) : process.cwd();

  // Create directory if needed
  if (nameArg && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // ── Generate files ────────────────────────────────────────

  const s = clack.spinner();
  s.start('Creating project files');

  // 1. gist.yaml
  const yamlContent = buildGistYaml(projectName, language, framework !== 'none' ? framework : undefined, kits);
  const yamlPath = path.join(targetDir, 'gist.yaml');
  const createdFiles: string[] = [];

  if (!fs.existsSync(yamlPath)) {
    fs.writeFileSync(yamlPath, yamlContent, 'utf-8');
    createdFiles.push('gist.yaml');
  }

  // 2. Starter .gist file
  const gistContent = buildStarterGist(projectName, kits);
  const gistPath = path.join(targetDir, `${projectName}.gist`);

  if (!fs.existsSync(gistPath)) {
    fs.writeFileSync(gistPath, gistContent, 'utf-8');
    createdFiles.push(`${projectName}.gist`);
  }

  // 3. Agent skills
  let agentResult: { installed: string[]; config?: ReturnType<typeof getAgentConfig> } | undefined;
  if (agent !== 'skip') {
    const result = installSkills(agent, targetDir);
    const config = getAgentConfig(agent);
    agentResult = { installed: result.installed, config };
  }

  // 4. Staged intent for /gist.gistify
  let intentPath: string | undefined;
  if (promptText.length > 0) {
    intentPath = writeIntent(targetDir, promptText);
    createdFiles.push(path.relative(targetDir, intentPath));
  }

  s.stop('Project files created');

  // ── Summary ───────────────────────────────────────────────

  const summaryLines: string[] = [];

  for (const file of createdFiles) {
    summaryLines.push(`${GREEN}+${RESET} ${file}`);
  }

  if (agentResult && agentResult.installed.length > 0) {
    for (const cmd of agentResult.installed) {
      summaryLines.push(`${GREEN}+${RESET} ${agentResult.config!.skillDir}/${cmd}${agentResult.config!.fileExtension}`);
    }
  }

  if (summaryLines.length > 0) {
    clack.note(summaryLines.join('\n'), 'Files created');
  }

  // ── Next steps ────────────────────────────────────────────

  const nextSteps: string[] = [];

  if (intentPath && agentResult?.config) {
    nextSteps.push(
      `Run ${BOLD}/${CYAN}gist.gistify${RESET} in ${agentResult.config.name} to populate the spec from your prompt`,
    );
  } else if (intentPath) {
    nextSteps.push(
      `Install agent skills (${BOLD}gist skills install --agent <name>${RESET}), then run ${BOLD}/${CYAN}gist.gistify${RESET}`,
    );
  } else {
    nextSteps.push(`Edit ${BOLD}${path.relative(process.cwd(), gistPath)}${RESET} to define your spec`);
  }

  nextSteps.push(`Run ${BOLD}gist check${RESET} to validate`);

  if (agentResult?.config) {
    nextSteps.push(`Use ${BOLD}/${CYAN}gist.generate${RESET} in ${agentResult.config.name} to generate code`);
  } else if (!intentPath) {
    nextSteps.push(`Run ${BOLD}gist skills install --agent <name>${RESET} to install AI agent skills`);
  }

  clack.note(nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n'), 'Next steps');

  clack.outro(`Project "${projectName}" is ready!`);
}

// ─── Non-Interactive Init ─────────────────────────────────────

function runInit(
  name: string | undefined,
  opts: { language?: string; framework?: string; kit?: string[]; agent?: string; prompt?: string },
): void {
  const projectName = name ?? path.basename(process.cwd());
  const targetDir = name ? path.resolve(process.cwd(), name) : process.cwd();

  // Create directory if needed
  if (name && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log('');

  // Generate gist.yaml
  const yamlContent = buildGistYaml(projectName, opts.language, opts.framework);
  const yamlPath = path.join(targetDir, 'gist.yaml');
  if (!fs.existsSync(yamlPath)) {
    fs.writeFileSync(yamlPath, yamlContent, 'utf-8');
    console.log(`  ${GREEN}+${RESET} ${path.relative(process.cwd(), yamlPath)}`);
  } else {
    console.log(`  ${DIM}skip${RESET} gist.yaml (already exists)`);
  }

  // Generate starter .gist file
  const gistContent = buildStarterGist(projectName, opts.kit);
  const gistPath = path.join(targetDir, `${projectName}.gist`);
  if (!fs.existsSync(gistPath)) {
    fs.writeFileSync(gistPath, gistContent, 'utf-8');
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
      for (const skillName of result.installed) {
        console.log(`  ${GREEN}+${RESET} ${config.skillDir}/${skillName}${config.fileExtension}`);
      }
    }
  }

  // Stage intent for /gist.gistify if a prompt was provided
  let intentPath: string | undefined;
  const promptText = (opts.prompt ?? '').trim();
  if (promptText.length > 0) {
    intentPath = writeIntent(targetDir, promptText);
    console.log(`  ${GREEN}+${RESET} ${path.relative(process.cwd(), intentPath)}`);
  }

  console.log('');
  console.log(`${GREEN}✓${RESET} Project "${projectName}" initialized.`);
  console.log('');
  console.log('Next steps:');

  let step = 1;
  if (intentPath && opts.agent) {
    const agentId = opts.agent as AgentId;
    const config = getAgentConfig(agentId);
    console.log(`  ${step++}. Run ${BOLD}/${CYAN}gist.gistify${RESET} in ${config.name} to populate the spec from your prompt`);
  } else if (intentPath) {
    console.log(`  ${step++}. Install agent skills (${BOLD}gist skills install --agent <name>${RESET}), then run ${BOLD}/${CYAN}gist.gistify${RESET}`);
  } else {
    console.log(`  ${step++}. Edit ${BOLD}${path.relative(process.cwd(), gistPath)}${RESET} to define your spec`);
  }

  console.log(`  ${step++}. Run ${BOLD}gist check${RESET} to validate`);

  if (opts.agent) {
    const agentId = opts.agent as AgentId;
    const config = getAgentConfig(agentId);
    console.log(`  ${step++}. Use ${BOLD}/${CYAN}gist.generate${RESET} in ${config.name} to generate code`);
  } else if (!intentPath) {
    console.log(`  ${step++}. Run ${BOLD}gist skills install --agent <name>${RESET} to install AI agent skills`);
    console.log(`     Supported: ${AGENT_IDS.join(', ')}`);
  }
}

/**
 * Write a natural-language prompt to .gist/intent.md for /gist.gistify to consume.
 */
function writeIntent(targetDir: string, prompt: string): string {
  const gistDir = path.join(targetDir, '.gist');
  if (!fs.existsSync(gistDir)) {
    fs.mkdirSync(gistDir, { recursive: true });
  }
  const intentPath = path.join(gistDir, 'intent.md');
  const header = `# Intent\n\nStaged ${new Date().toISOString()}\n\n`;
  fs.writeFileSync(intentPath, header + prompt.trim() + '\n', 'utf-8');
  return intentPath;
}

// ─── File Builders ────────────────────────────────────────────

/**
 * Build gist.yaml content from project configuration.
 */
function buildGistYaml(
  projectName: string,
  language?: string,
  framework?: string,
  kits?: string[],
): string {
  const lines: string[] = [`project: ${projectName}`];

  if (language) {
    lines.push('', 'runtime:');
    lines.push(`  language: ${language}`);
  }

  if (framework) {
    lines.push('', 'framework:');
    lines.push(`  name: ${framework}`);
  }

  if (kits && kits.length > 0) {
    lines.push('', '# Kits declared here should match the "kit:" line in your .gist files');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Build starter .gist file content with commented-out examples.
 */
function buildStarterGist(projectName: string, kits?: string[]): string {
  const lines: string[] = [`project ${projectName}`];

  if (kits && kits.length > 0) {
    lines.push(`  kit: ${kits.join(', ')}`);
  }

  lines.push(
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

  return lines.join('\n');
}
