import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { discoverWorkspace } from '@gist-lang/workspace';
import { format } from '@gist-lang/formatter';
import type { FormatOptions } from '@gist-lang/formatter';

export function registerFmtCommand(program: Command): void {
  program
    .command('fmt [files...]')
    .description('Format .gist files')
    .option('--check', 'check if files are already formatted (exit 1 if not)')
    .option('--write', 'write formatted output back to files (default: print to stdout)')
    .option('--indent <size>', 'indentation width in spaces', '2')
    .action((files: string[], opts: { check?: boolean; write?: boolean; indent: string }) => {
      const exitCode = runFmt(files, opts);
      process.exit(exitCode);
    });
}

function runFmt(
  files: string[],
  opts: { check?: boolean; write?: boolean; indent: string },
): number {
  const rootDir = process.cwd();

  // Determine which files to format
  let filesToFormat: string[];
  if (files.length > 0) {
    filesToFormat = files.map(f => path.resolve(rootDir, f));
  } else {
    const workspace = discoverWorkspace(rootDir);
    filesToFormat = workspace.gistFiles;
  }

  if (filesToFormat.length === 0) {
    console.log('No .gist files found.');
    return 0;
  }

  const formatOptions: FormatOptions = {
    indentWidth: parseInt(opts.indent, 10) || 2,
  };

  let unformattedCount = 0;
  let errorCount = 0;

  for (const filePath of filesToFormat) {
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch {
      console.error(`\x1b[31merror\x1b[0m: Cannot read file: ${filePath}`);
      errorCount++;
      continue;
    }

    const formatted = format(source, formatOptions);
    const relativePath = path.relative(rootDir, filePath);

    if (opts.check) {
      // --check mode: just report if files would change
      if (source !== formatted) {
        console.log(`\x1b[33mwould reformat\x1b[0m: ${relativePath}`);
        unformattedCount++;
      }
    } else if (opts.write) {
      // --write mode: write back to file
      if (source !== formatted) {
        fs.writeFileSync(filePath, formatted, 'utf-8');
        console.log(`\x1b[32mformatted\x1b[0m: ${relativePath}`);
        unformattedCount++;
      }
    } else {
      // Default: print to stdout
      if (filesToFormat.length > 1) {
        console.log(`\x1b[36m── ${relativePath} ──\x1b[0m`);
      }
      process.stdout.write(formatted);
    }
  }

  if (opts.check) {
    if (unformattedCount > 0) {
      console.log(
        `\n\x1b[33m⚠\x1b[0m ${unformattedCount} file${unformattedCount !== 1 ? 's' : ''} ` +
        `would be reformatted.`
      );
      return 1;
    } else {
      console.log(
        `\x1b[32m✓\x1b[0m ${filesToFormat.length} file${filesToFormat.length !== 1 ? 's' : ''} ` +
        `already formatted.`
      );
      return 0;
    }
  }

  if (opts.write && unformattedCount === 0) {
    console.log(
      `\x1b[32m✓\x1b[0m ${filesToFormat.length} file${filesToFormat.length !== 1 ? 's' : ''} ` +
      `already formatted.`
    );
  }

  return errorCount > 0 ? 1 : 0;
}
