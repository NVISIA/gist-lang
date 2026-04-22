import * as path from 'path';
import type { Diagnostic, GistProgram, TextSpan, UseNode } from '@gist-lang/parser';
import { DiagnosticSeverity } from '@gist-lang/parser';
import type { SymbolTable } from './symbol-table.js';

// ─── Types ────────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  program: GistProgram;
  symbols: SymbolTable;
}

export interface ResolvedImport {
  aliasName: string;
  importingFile: string;
  /** Raw path as written in the source. */
  rawTarget: string;
  /** Resolved absolute path, or null if unresolvable. */
  targetPath: string | null;
  /** Set of names in the `exposing` clause, or undefined for wildcard. */
  exposing?: Set<string>;
  /** Span of the `use` statement (for diagnostics). */
  span: TextSpan;
  /** The original AST node (so LSP can map back). */
  node: UseNode;
}

export interface ImportGraph {
  /** File path → imports keyed by alias. */
  byFile: Map<string, Map<string, ResolvedImport>>;
  /** File path → AST. */
  programs: Map<string, GistProgram>;
  /** File path → SymbolTable. */
  symbols: Map<string, SymbolTable>;
  /** File path → diagnostics produced during graph construction. */
  diagnostics: Map<string, Diagnostic[]>;
}

/** Lazily load a file by absolute path (for the LSP where not all files are pre-parsed). */
export type FileLoader = (absPath: string) => FileEntry | null;

// ─── Public API ───────────────────────────────────────────────

export function buildImportGraph(
  files: FileEntry[],
  loader?: FileLoader,
): ImportGraph {
  const graph: ImportGraph = {
    byFile: new Map(),
    programs: new Map(),
    symbols: new Map(),
    diagnostics: new Map(),
  };

  for (const f of files) {
    graph.programs.set(f.path, f.program);
    graph.symbols.set(f.path, f.symbols);
  }

  for (const f of files) {
    const diagnostics: Diagnostic[] = [];
    const imports = new Map<string, ResolvedImport>();

    for (const comp of f.program.compositions) {
      if (comp.compositionKind !== 'use') continue;
      const useNode = comp;
      const resolved = resolveUseNode(useNode, f.path, graph, loader, diagnostics);
      if (!resolved) continue;

      // Alias collision within this file
      if (imports.has(resolved.aliasName)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          span: resolved.span,
          message: `Alias '${resolved.aliasName}' is already used in this file`,
        });
      } else {
        imports.set(resolved.aliasName, resolved);
      }

      // Duplicate names in the exposing list
      if (useNode.exposing && useNode.exposing.length > 1) {
        const seen = new Set<string>();
        for (const exposed of useNode.exposing) {
          if (seen.has(exposed.name)) {
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              span: exposed.span,
              message: `'${exposed.name}' appears more than once in this exposing list`,
            });
          } else {
            seen.add(exposed.name);
          }
        }
      }

      // Unknown exposed names
      if (resolved.exposing && resolved.targetPath) {
        const targetSymbols = graph.symbols.get(resolved.targetPath);
        if (targetSymbols) {
          for (const exposed of useNode.exposing ?? []) {
            if (!targetSymbols.isDeclared(exposed.name)) {
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                span: exposed.span,
                message: `'${exposed.name}' is not declared in '${resolved.rawTarget}'`,
              });
            }
          }
        }
      }
    }

    graph.byFile.set(f.path, imports);
    graph.diagnostics.set(f.path, diagnostics);
  }

  // Cycle detection — adds to diagnostics already in the graph.
  detectCycles(graph);

  return graph;
}

export function resolveAlias(
  graph: ImportGraph,
  importingFile: string,
  alias: string,
): ResolvedImport | null {
  return graph.byFile.get(importingFile)?.get(alias) ?? null;
}

/**
 * Incrementally rebuild the graph entries that depend on a single changed file.
 * Updates `programs`, `symbols`, `byFile`, and `diagnostics` for the changed
 * file, then re-runs cycle detection (cheap — the file graph is small).
 */
export function updateFileInGraph(
  graph: ImportGraph,
  entry: FileEntry,
  loader?: FileLoader,
): void {
  graph.programs.set(entry.path, entry.program);
  graph.symbols.set(entry.path, entry.symbols);

  const diagnostics: Diagnostic[] = [];
  const imports = new Map<string, ResolvedImport>();

  for (const comp of entry.program.compositions) {
    if (comp.compositionKind !== 'use') continue;
    const useNode = comp;
    const resolved = resolveUseNode(useNode, entry.path, graph, loader, diagnostics);
    if (!resolved) continue;

    if (imports.has(resolved.aliasName)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        span: resolved.span,
        message: `Alias '${resolved.aliasName}' is already used in this file`,
      });
    } else {
      imports.set(resolved.aliasName, resolved);
    }

    // Duplicate names in the exposing list
    if (useNode.exposing && useNode.exposing.length > 1) {
      const seen = new Set<string>();
      for (const exposed of useNode.exposing) {
        if (seen.has(exposed.name)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            span: exposed.span,
            message: `'${exposed.name}' appears more than once in this exposing list`,
          });
        } else {
          seen.add(exposed.name);
        }
      }
    }

    // Unknown exposed names
    if (resolved.exposing && resolved.targetPath) {
      const targetSymbols = graph.symbols.get(resolved.targetPath);
      if (targetSymbols) {
        for (const exposed of useNode.exposing ?? []) {
          if (!targetSymbols.isDeclared(exposed.name)) {
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              span: exposed.span,
              message: `'${exposed.name}' is not declared in '${resolved.rawTarget}'`,
            });
          }
        }
      }
    }
  }

  graph.byFile.set(entry.path, imports);

  // Clear stale cycle warnings from the prior pass; detectCycles re-adds them.
  graph.diagnostics.set(entry.path, diagnostics);
  // Recompute cycles globally (cheap — walks the already-built byFile graph).
  // We also need to drop cycle diagnostics from OTHER files because they may
  // reference a cycle that no longer exists.
  for (const [file, diags] of graph.diagnostics) {
    graph.diagnostics.set(
      file,
      diags.filter(d => !d.message.startsWith('Import cycle detected')),
    );
  }
  detectCycles(graph);
}

/**
 * Remove a file from the graph entirely. Use when a .gist file is deleted on
 * disk. Cycles that involved the file are cleared and recomputed.
 */
export function removeFileFromGraph(graph: ImportGraph, absPath: string): void {
  graph.programs.delete(absPath);
  graph.symbols.delete(absPath);
  graph.byFile.delete(absPath);
  graph.diagnostics.delete(absPath);

  // Drop stale cycle diagnostics that may reference the removed file.
  for (const [file, diags] of graph.diagnostics) {
    graph.diagnostics.set(
      file,
      diags.filter(d => !d.message.startsWith('Import cycle detected')),
    );
  }
  detectCycles(graph);
}

export function isExposed(
  graph: ImportGraph,
  importingFile: string,
  alias: string,
  name: string,
): boolean {
  const imp = resolveAlias(graph, importingFile, alias);
  if (!imp) return false;
  // Wildcard when exposing is undefined.
  if (!imp.exposing) return true;
  return imp.exposing.has(name);
}

// ─── Internal ─────────────────────────────────────────────────

function resolveUseNode(
  useNode: UseNode,
  importingFile: string,
  graph: ImportGraph,
  loader: FileLoader | undefined,
  diagnostics: Diagnostic[],
): ResolvedImport | null {
  if (!useNode.alias) {
    // Missing alias — parser already warns. Nothing we can resolve.
    return null;
  }

  const resolvedPath = resolvePath(useNode.target, importingFile);
  let targetPath: string | null = null;

  if (resolvedPath) {
    if (graph.programs.has(resolvedPath)) {
      targetPath = resolvedPath;
    } else if (loader) {
      const loaded = loader(resolvedPath);
      if (loaded) {
        graph.programs.set(loaded.path, loaded.program);
        graph.symbols.set(loaded.path, loaded.symbols);
        targetPath = loaded.path;
      }
    }
  }

  if (!targetPath) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      span: useNode.span,
      message: `Cannot resolve import path '${useNode.target}'`,
    });
  }

  const exposing = useNode.exposing
    ? new Set(useNode.exposing.map(e => e.name))
    : undefined;

  return {
    aliasName: useNode.alias,
    importingFile,
    rawTarget: useNode.target,
    targetPath,
    exposing,
    span: useNode.span,
    node: useNode,
  };
}

function resolvePath(rawTarget: string, importingFile: string): string | null {
  const dir = path.dirname(importingFile);
  const candidate = path.resolve(dir, rawTarget);
  if (candidate.endsWith('.gist')) return candidate;
  // Try with auto-appended .gist
  return candidate + '.gist';
}

function detectCycles(graph: ImportGraph): void {
  const visited = new Set<string>();
  const onStack = new Set<string>();

  const visit = (file: string, pathSoFar: string[]): void => {
    if (onStack.has(file)) {
      // Cycle closed — attach to every file on the current DFS stack.
      const start = pathSoFar.indexOf(file);
      const cycle = pathSoFar.slice(start).concat(file);
      for (const node of cycle) {
        const diags = graph.diagnostics.get(node) ?? [];
        const imports = graph.byFile.get(node);
        // Find the specific use statement whose target is the next file in the cycle.
        if (imports) {
          for (const imp of imports.values()) {
            if (imp.targetPath && cycle.includes(imp.targetPath)) {
              diags.push({
                severity: DiagnosticSeverity.Warning,
                span: imp.span,
                message: `Import cycle detected: ${cycle.join(' → ')}`,
              });
              break;
            }
          }
        }
        graph.diagnostics.set(node, diags);
      }
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    onStack.add(file);

    const imports = graph.byFile.get(file);
    if (imports) {
      for (const imp of imports.values()) {
        if (imp.targetPath) {
          visit(imp.targetPath, [...pathSoFar, file]);
        }
      }
    }

    onStack.delete(file);
  };

  for (const file of graph.byFile.keys()) {
    if (!visited.has(file)) {
      visit(file, []);
    }
  }
}
