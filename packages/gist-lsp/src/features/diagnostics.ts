import type { GistProgram, Diagnostic } from '@gist-lang/parser';
import { SymbolTable, runAllValidators } from '@gist-lang/workspace';
import type { GistProjectConfig, KitRegistry } from '@gist-lang/workspace';

/**
 * Run semantic analysis on an AST and return diagnostics.
 * This is called after parsing to produce semantic-level errors/warnings.
 */
export function computeSemanticDiagnostics(
  program: GistProgram,
  config: GistProjectConfig | null,
  kitRegistry: KitRegistry | null,
): { diagnostics: Diagnostic[]; symbols: SymbolTable } {
  const symbols = SymbolTable.build(program, config);

  // Extract declared kit names from project header
  const declaredKits = program.project?.kit ?? [];

  const diagnostics = runAllValidators(program, symbols, kitRegistry, declaredKits);

  return { diagnostics, symbols };
}
