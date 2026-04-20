import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { detectAgents } from '../agents/registrar.js';
import { getAgentConfig } from '../agents/configs.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

interface GistifyOptions {
  file?: string;
  stdin?: boolean;
}

export function registerGistifyCommand(program: Command): void {
  program
    .command('gistify [prompt...]')
    .description('Stage a natural-language prompt for /gist.gistify to consume')
    .option('-f, --file <path>', 'read the prompt from a file instead of arguments')
    .option('--stdin', 'read the prompt from standard input')
    .action((promptWords: string[], opts: GistifyOptions) => {
      runGistify(promptWords, opts);
    });
}

function runGistify(promptWords: string[], opts: GistifyOptions): void {
  const prompt = resolvePrompt(promptWords, opts);
  if (!prompt) {
    console.error(
      `${RED}error${RESET} no prompt provided. Pass it as arguments, via --file <path>, or via --stdin.`,
    );
    process.exit(1);
  }

  const projectDir = process.cwd();
  const gistDir = path.join(projectDir, '.gist');
  const intentPath = path.join(gistDir, 'intent.md');

  if (!fs.existsSync(gistDir)) {
    fs.mkdirSync(gistDir, { recursive: true });
  }

  const header = `# Intent\n\nStaged ${new Date().toISOString()}\n\n`;
  fs.writeFileSync(intentPath, header + prompt.trim() + '\n', 'utf-8');

  const relIntent = path.relative(projectDir, intentPath);
  console.log('');
  console.log(`${GREEN}+${RESET} ${relIntent}`);
  console.log('');

  const detected = detectAgents(projectDir);

  if (detected.length === 0) {
    console.log(`${BOLD}Next steps:${RESET}`);
    console.log(
      `  1. Install an agent's skills: ${BOLD}gist skills install --agent <name>${RESET}`,
    );
    console.log(`  2. Run ${CYAN}/gist.gistify${RESET} in that agent to generate your spec.`);
    return;
  }

  const primary = detected[0];
  const config = getAgentConfig(primary);
  console.log(`${BOLD}Next step:${RESET}`);
  console.log(`  Run ${CYAN}/gist.gistify${RESET} in ${BOLD}${config.name}${RESET} to generate your spec.`);

  if (detected.length > 1) {
    const others = detected.slice(1).map((id) => getAgentConfig(id).name).join(', ');
    console.log(`  ${DIM}(also detected: ${others})${RESET}`);
  }
}

function resolvePrompt(promptWords: string[], opts: GistifyOptions): string | null {
  if (opts.file) {
    const filePath = path.resolve(process.cwd(), opts.file);
    if (!fs.existsSync(filePath)) {
      console.error(`${RED}error${RESET} file not found: ${opts.file}`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    return content.length > 0 ? content : null;
  }

  if (opts.stdin) {
    const content = readStdinSync().trim();
    return content.length > 0 ? content : null;
  }

  const joined = promptWords.join(' ').trim();
  return joined.length > 0 ? joined : null;
}

function readStdinSync(): string {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}
