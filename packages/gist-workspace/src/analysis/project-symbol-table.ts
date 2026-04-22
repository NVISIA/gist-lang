import type {
  FieldDeclaration,
  ModelDeclaration,
  TraitDeclaration,
  TypeDeclaration,
  EnumDeclaration,
  ErrorDeclaration,
  TextSpan,
} from '@gist-lang/parser';
import type { SymbolTable, SymbolKind } from './symbol-table.js';
import type { ImportGraph, ResolvedImport } from './import-resolver.js';
import { resolveAlias, isExposed } from './import-resolver.js';

export interface ExtensionRef {
  kind: 'extend' | 'refine';
  body: string[];
  sourceFile: string;
  span: TextSpan;
}

export type ResolvableDecl =
  | ModelDeclaration
  | TraitDeclaration
  | TypeDeclaration
  | EnumDeclaration
  | ErrorDeclaration;

export interface ResolvedSymbol {
  kind: SymbolKind;
  decl: ResolvableDecl;
  sourceFile: string;
  /** The alias used to reference it (undefined for local). */
  alias?: string;
}

/**
 * Resolver for symbols across the current file and its imports.
 *
 * Wraps a per-file SymbolTable with an ImportGraph so validators and LSP
 * features have one place to ask "does this name resolve anywhere?".
 */
export class ProjectSymbolTable {
  constructor(
    public readonly graph: ImportGraph,
    public readonly currentFile: string,
    public readonly local: SymbolTable,
  ) {}

  /**
   * Resolve a possibly-qualified name in the current file's import context.
   * Returns null when the reference points to nothing reachable.
   */
  resolveTypeName(ref: { alias?: string; name: string }): ResolvedSymbol | null {
    if (!ref.alias) {
      return resolveInSymbolTable(this.local, ref.name, this.currentFile);
    }

    const imp = resolveAlias(this.graph, this.currentFile, ref.alias);
    if (!imp?.targetPath) return null;

    if (!isExposed(this.graph, this.currentFile, ref.alias, ref.name)) {
      return null;
    }

    const targetSymbols = this.graph.symbols.get(imp.targetPath);
    if (!targetSymbols) return null;

    const resolved = resolveInSymbolTable(targetSymbols, ref.name, imp.targetPath);
    if (!resolved) return null;
    return { ...resolved, alias: ref.alias };
  }

  /**
   * Scan sibling files in the workspace for a top-level symbol with this
   * name. Used by the LSP auto-import quick-fix when a bare reference
   * doesn't resolve locally.
   */
  isExportedFromSibling(
    name: string,
  ): { sourceFile: string; suggestedAlias: string } | null {
    for (const [filePath, symbols] of this.graph.symbols) {
      if (filePath === this.currentFile) continue;
      if (symbols.isTypeName(name)) {
        return { sourceFile: filePath, suggestedAlias: suggestAlias(filePath) };
      }
    }
    return null;
  }

  /**
   * Like SymbolTable.getResolvedFields but follows cross-file spreads via
   * the import graph. One level of resolution, matching existing semantics.
   */
  getResolvedFields(modelName: string): FieldDeclaration[] {
    const model = this.local.models.get(modelName);
    if (!model) return [];

    const fields = [...model.fields];
    for (const spread of model.spreads) {
      let source: ModelDeclaration | TraitDeclaration | undefined;
      if (spread.alias) {
        const resolved = this.resolveTypeName({ alias: spread.alias, name: spread.name });
        if (resolved && (resolved.kind === 'trait' || resolved.kind === 'model')) {
          source = resolved.decl as ModelDeclaration | TraitDeclaration;
        }
      } else {
        source = this.local.traits.get(spread.name) ?? this.local.models.get(spread.name);
      }
      if (source) {
        fields.push(...source.fields);
      }
    }
    return fields;
  }

  /**
   * List exposed top-level symbols for a given alias (for LSP completion).
   * Returns an empty list if the alias is unresolved. Includes error
   * declarations alongside models / enums / types / traits, since errors
   * are legal in type-reference positions (`-> Result | NotFound`).
   */
  listAliasMembers(alias: string): string[] {
    const imp = resolveAlias(this.graph, this.currentFile, alias);
    if (!imp?.targetPath) return [];
    const targetSymbols = this.graph.symbols.get(imp.targetPath);
    if (!targetSymbols) return [];
    const names = [
      ...targetSymbols.getAllTypeNames(),
      ...targetSymbols.errors.keys(),
    ];
    if (imp.exposing) {
      return names.filter(n => imp.exposing!.has(n));
    }
    return names;
  }

  getImport(alias: string): ResolvedImport | null {
    return resolveAlias(this.graph, this.currentFile, alias);
  }

  /**
   * Collect every `extend` / `refine` across the workspace that targets the
   * named intent (or fn) declared in the current file. Matches three target
   * forms:
   *   - bare `name`            (same-file target)
   *   - `moduleName.name`      (module-qualified, same-file)
   *   - `alias.name`           (cross-file, alias resolves back to currentFile)
   *
   * Returned in a deterministic order: source file path, then span start.
   */
  getExtensionsFor(intentName: string, moduleName?: string): ExtensionRef[] {
    const results: ExtensionRef[] = [];
    const dottedLocal = moduleName ? `${moduleName}.${intentName}` : null;

    for (const [otherFile, otherProgram] of this.graph.programs) {
      const otherImports = this.graph.byFile.get(otherFile);
      for (const comp of otherProgram.compositions) {
        if (comp.compositionKind !== 'extend' && comp.compositionKind !== 'refine') continue;
        const target = comp.target;
        if (!target) continue;

        let matches = false;

        if (target === intentName) {
          // Bare target is only a match when it lives in the same file as the intent.
          matches = otherFile === this.currentFile;
        } else if (dottedLocal && target === dottedLocal && otherFile === this.currentFile) {
          matches = true;
        } else if (target.includes('.')) {
          const [alias, name] = target.split('.', 2) as [string, string];
          if (name === intentName) {
            const imp = otherImports?.get(alias);
            if (imp?.targetPath === this.currentFile) {
              matches = true;
            }
          }
        }

        if (matches) {
          results.push({
            kind: comp.compositionKind,
            body: comp.body,
            sourceFile: otherFile,
            span: comp.span,
          });
        }
      }
    }

    results.sort((a, b) => {
      if (a.sourceFile !== b.sourceFile) return a.sourceFile.localeCompare(b.sourceFile);
      return a.span.start.offset - b.span.start.offset;
    });

    return results;
  }
}

function resolveInSymbolTable(
  table: SymbolTable,
  name: string,
  sourceFile: string,
): ResolvedSymbol | null {
  const model = table.models.get(name);
  if (model) return { kind: 'model', decl: model, sourceFile };
  const trait = table.traits.get(name);
  if (trait) return { kind: 'trait', decl: trait, sourceFile };
  const type = table.types.get(name);
  if (type) return { kind: 'type', decl: type, sourceFile };
  const enumDecl = table.enums.get(name);
  if (enumDecl) return { kind: 'enum', decl: enumDecl, sourceFile };
  const err = table.errors.get(name);
  if (err) return { kind: 'error', decl: err, sourceFile };
  return null;
}

/** Generate a snake_case alias suggestion from a file path. */
function suggestAlias(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.gist$/, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
}
