import type { GistProgram, Diagnostic } from '@gist-lang/parser';
import { SymbolTable, runAllValidators } from '@gist-lang/workspace';
import type { GistProjectConfig, KitRegistry, ProjectSymbolTable } from '@gist-lang/workspace';

/**
 * Run semantic analysis on an AST and return diagnostics.
 * This is called after parsing to produce semantic-level errors/warnings.
 */
export function computeSemanticDiagnostics(
  program: GistProgram,
  config: GistProjectConfig | null,
  kitRegistry: KitRegistry | null,
  project: ProjectSymbolTable | null = null,
): { diagnostics: Diagnostic[]; symbols: SymbolTable } {
  const symbols = project?.local ?? SymbolTable.build(program, config);

  // Extract declared kit names from project header
  const declaredKits = program.project?.kit ?? [];

  const diagnostics = runAllValidators(program, symbols, kitRegistry, declaredKits, project);

  return { diagnostics, symbols };
}
