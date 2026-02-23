import type { Diagnostic } from '@gist-lang/parser';
import { DiagnosticSeverity } from '@gist-lang/parser';
import * as path from 'path';

// ANSI color codes
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

export interface FileResult {
  file: string;
  diagnostics: Diagnostic[];
}

/**
 * Format diagnostics for terminal output (file:line:col style).
 */
export function formatDiagnostics(results: FileResult[], rootDir: string): string {
  const lines: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;

  for (const { file, diagnostics } of results) {
    if (diagnostics.length === 0) continue;
    const relPath = path.relative(rootDir, file);

    for (const diag of diagnostics) {
      const line = diag.span.start.line + 1;
      const col = diag.span.start.column + 1;
      const loc = `${relPath}:${line}:${col}`;

      let severity: string;
      let color: string;
      switch (diag.severity) {
        case DiagnosticSeverity.Error:
          severity = 'error';
          color = RED;
          totalErrors++;
          break;
        case DiagnosticSeverity.Warning:
          severity = 'warning';
          color = YELLOW;
          totalWarnings++;
          break;
        default:
          severity = 'info';
          color = CYAN;
          totalInfo++;
          break;
      }

      lines.push(`${DIM}${loc}${RESET} ${color}${severity}${RESET} ${diag.message}`);
    }
  }

  if (lines.length > 0) {
    lines.push('');
    const parts: string[] = [];
    if (totalErrors > 0) parts.push(`${RED}${totalErrors} error${totalErrors !== 1 ? 's' : ''}${RESET}`);
    if (totalWarnings > 0) parts.push(`${YELLOW}${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}${RESET}`);
    if (totalInfo > 0) parts.push(`${CYAN}${totalInfo} info${RESET}`);
    lines.push(`${BOLD}${parts.join(', ')}${RESET}`);
  }

  return lines.join('\n');
}

/**
 * Format diagnostics as JSON (for --format json).
 */
export function formatDiagnosticsJson(results: FileResult[], rootDir: string): string {
  const output = results.flatMap(({ file, diagnostics }) =>
    diagnostics.map(diag => ({
      file: path.relative(rootDir, file),
      line: diag.span.start.line + 1,
      column: diag.span.start.column + 1,
      severity: diag.severity === DiagnosticSeverity.Error ? 'error'
        : diag.severity === DiagnosticSeverity.Warning ? 'warning' : 'info',
      message: diag.message,
    }))
  );
  return JSON.stringify(output, null, 2);
}

/**
 * Count errors from a set of results.
 */
export function countErrors(results: FileResult[]): number {
  let count = 0;
  for (const { diagnostics } of results) {
    for (const diag of diagnostics) {
      if (diag.severity === DiagnosticSeverity.Error) count++;
    }
  }
  return count;
}
