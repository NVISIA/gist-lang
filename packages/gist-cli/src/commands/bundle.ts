import { Command } from 'commander';
import * as fs from 'fs';
import { assembleBundle, formatBundle } from '../bundler/prompt-assembler.js';

export function registerBundleCommand(program: Command): void {
  program
    .command('bundle')
    .description('Assemble all project inputs into a single LLM prompt')
    .option('--output <file>', 'write to file instead of stdout')
    .option('--no-spec', 'omit the GIST-interpreter.md spec from the bundle')
    .action((opts: { output?: string; spec?: boolean }) => {
      runBundle(opts);
    });
}

function runBundle(opts: { output?: string; spec?: boolean }): void {
  const rootDir = process.cwd();
  const includeSpec = opts.spec !== false;

  const sections = assembleBundle({
    rootDir,
    includeInterpreterSpec: includeSpec,
  });

  if (sections.length === 0) {
    console.error('No .gist files found in the current directory.');
    process.exit(1);
  }

  const output = formatBundle(sections);

  if (opts.output) {
    fs.writeFileSync(opts.output, output, 'utf-8');
    const sizeKb = (Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1);
    console.log(`\x1b[32m✓\x1b[0m Bundle written to ${opts.output} (${sizeKb} KB, ${sections.length} sections)`);
  } else {
    process.stdout.write(output);
  }
}
