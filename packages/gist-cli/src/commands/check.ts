import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { lex, parse, cstToAst, DiagnosticSeverity } from '@gist-lang/parser';
import type { Diagnostic, GistProgram } from '@gist-lang/parser';
import {
  discoverWorkspace,
  parseGistYaml,
  loadAllKits,
  KitRegistry,
  SymbolTable,
  runAllValidators,
  buildImportGraph,
  ProjectSymbolTable,
} from '@gist-lang/workspace';
import type { FileEntry } from '@gist-lang/workspace';
import { formatDiagnostics, formatDiagnosticsJson, countErrors } from '../util/reporter.js';
import type { FileResult } from '../util/reporter.js';
import { runChecklist, formatChecklist, formatChecklistJson } from '../analysis/checklist.js';

export function registerCheckCommand(program: Command): void {
  program
    .command('check [files...]')
    .description('Validate .gist files for syntax and semantic errors')
    .option('--format <type>', 'output format: text or json', 'text')
    .option('--checklist', 'also run spec quality checks')
    .action((files: string[], opts: { format: string; checklist?: boolean }) => {
      const exitCode = runCheck(files, opts);
      process.exit(exitCode);
    });
}

function runCheck(files: string[], opts: { format: string; checklist?: boolean }): number {
  const rootDir = process.cwd();

  // Discover workspace
  const workspace = discoverWorkspace(rootDir);

  // Load project config
  let projectConfig = null;
  if (workspace.gistYamlPath) {
    projectConfig = parseGistYaml(workspace.gistYamlPath);
  }

  // Load kits
  const kitRegistry = new KitRegistry();
  const kits = loadAllKits(workspace.kitDirs);
  for (const kit of kits) {
    kitRegistry.addKit(kit);
  }
  const kitKeywords = kitRegistry.getAllKeywords();
  const hasKits = kitRegistry.getLoadedKitNames().length > 0;

  // Determine which files to check
  let filesToCheck: string[];
  if (files.length > 0) {
    filesToCheck = files.map(f => path.resolve(rootDir, f));
  } else {
    filesToCheck = workspace.gistFiles;
  }

  if (filesToCheck.length === 0) {
    if (opts.format === 'json') {
      console.log('[]');
    } else {
      console.log('No .gist files found.');
    }
    return 0;
  }

  // Validate each file — Pass A: parse + per-file symbol table
  const results: FileResult[] = [];
  const allAsts: GistProgram[] = [];
  const allSymbols: SymbolTable[] = [];
  const preDiagnostics = new Map<string, Diagnostic[]>();
  const fileEntries: FileEntry[] = [];

  for (const filePath of filesToCheck) {
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch {
      results.push({
        file: filePath,
        diagnostics: [{
          severity: DiagnosticSeverity.Error,
          message: `Cannot read file: ${filePath}`,
          span: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } },
        }],
      });
      continue;
    }

    const diagnostics: Diagnostic[] = [];

    // Phase 1: Lex
    const lexResult = lex(source, {
      kitKeywords: kitKeywords.size > 0 ? kitKeywords : undefined,
    });
    diagnostics.push(...lexResult.diagnostics);

    // Phase 2: Parse
    const parseResult = parse(lexResult.tokens);
    diagnostics.push(...parseResult.diagnostics);

    // Phase 3: CST -> AST
    const ast = cstToAst(parseResult.cst);
    allAsts.push(ast);

    // Per-file SymbolTable
    const symbols = SymbolTable.build(ast, projectConfig);
    allSymbols.push(symbols);

    preDiagnostics.set(filePath, diagnostics);
    fileEntries.push({ path: filePath, program: ast, symbols });
  }

  // Pass B: build import graph across files and run validators with it
  const entriesByPath = new Map(fileEntries.map(e => [e.path, e]));
  const importGraph = buildImportGraph(fileEntries, absPath => entriesByPath.get(absPath) ?? null);

  for (const entry of fileEntries) {
    const diagnostics = preDiagnostics.get(entry.path) ?? [];
    const project = new ProjectSymbolTable(importGraph, entry.path, entry.symbols);
    const declaredKits = entry.program.project?.kit ?? [];
    const semanticDiags = runAllValidators(
      entry.program,
      entry.symbols,
      hasKits ? kitRegistry : null,
      declaredKits,
      project,
    );
    diagnostics.push(...semanticDiags);
    results.push({ file: entry.path, diagnostics });
  }

  // Output diagnostics
  if (opts.format === 'json') {
    const jsonOutput: Record<string, unknown> = {
      diagnostics: JSON.parse(formatDiagnosticsJson(results, rootDir)),
    };

    // Checklist
    if (opts.checklist) {
      const checklistItems = allAsts.flatMap((ast, i) => runChecklist(ast, allSymbols[i]));
      jsonOutput.checklist = JSON.parse(formatChecklistJson(checklistItems));
    }

    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    const totalFiles = filesToCheck.length;
    const output = formatDiagnostics(results, rootDir);

    if (output) {
      console.log(output);
    } else {
      console.log(`\x1b[32m✓\x1b[0m ${totalFiles} file${totalFiles !== 1 ? 's' : ''} checked — no issues found.`);
    }

    // Checklist
    if (opts.checklist) {
      console.log('');
      const checklistItems = allAsts.flatMap((ast, i) => runChecklist(ast, allSymbols[i]));
      console.log(formatChecklist(checklistItems));
    }
  }

  return countErrors(results) > 0 ? 1 : 0;
}
