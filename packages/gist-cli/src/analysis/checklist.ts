import type { GistProgram } from '@gist-lang/parser';
import type { SymbolTable } from '@gist-lang/workspace';

export type CheckSeverity = 'warning' | 'info';

export interface CheckItem {
  id: string;
  category: string;
  message: string;
  severity: CheckSeverity;
  /** The symbol or context this check applies to. */
  subject?: string;
}

/**
 * Run spec quality checks on a parsed program.
 * These are not syntax/semantic errors — they flag underspecified areas
 * that could weaken code generation quality.
 */
export function runChecklist(program: GistProgram, symbols: SymbolTable): CheckItem[] {
  const items: CheckItem[] = [];

  checkCompleteness(program, symbols, items);
  checkErrorHandling(program, items);
  checkTestCoverage(program, symbols, items);
  checkGuardCoverage(program, items);
  checkUnderspecification(program, items);

  return items;
}

// ─── Completeness ─────────────────────────────────────────

function checkCompleteness(
  program: GistProgram,
  symbols: SymbolTable,
  items: CheckItem[],
): void {
  // Intents with empty do: blocks
  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      if (!intent.doBlock || intent.doBlock.length === 0) {
        if (!intent.codeBlock || intent.codeBlock.length === 0) {
          items.push({
            id: 'completeness/empty-do',
            category: 'Completeness',
            message: `Intent "${mod.name}.${intent.name}" has no do: block — generation will lack implementation guidance.`,
            severity: 'warning',
            subject: `${mod.name}.${intent.name}`,
          });
        }
      }
    }

    // fns with empty do: blocks
    for (const fn of mod.fns) {
      if (!fn.doBlock || fn.doBlock.length === 0) {
        items.push({
          id: 'completeness/empty-fn-do',
          category: 'Completeness',
          message: `Function "${mod.name}.${fn.name}" has no do: block.`,
          severity: 'info',
          subject: `${mod.name}.${fn.name}`,
        });
      }
    }

    // Flows with no stages
    for (const flow of mod.flows) {
      if (flow.stages.length === 0) {
        items.push({
          id: 'completeness/empty-flow',
          category: 'Completeness',
          message: `Flow "${mod.name}.${flow.name}" has no stages defined.`,
          severity: 'warning',
          subject: `${mod.name}.${flow.name}`,
        });
      }
    }

    // Modules with no intents at all
    if (mod.intents.length === 0 && mod.fns.length === 0 && mod.flows.length === 0) {
      items.push({
        id: 'completeness/empty-module',
        category: 'Completeness',
        message: `Module "${mod.name}" has no intents, functions, or flows.`,
        severity: 'warning',
        subject: mod.name,
      });
    }
  }

  // Models that no intent references (saves/params/return)
  const referencedModels = new Set<string>();
  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      if (intent.saves) intent.saves.forEach(s => referencedModels.add(s));
      for (const p of intent.params) {
        if (p.type?.base.kind === 'named') referencedModels.add(p.type.base.name);
      }
      if (intent.returnType?.base.kind === 'named') {
        referencedModels.add(intent.returnType.base.name);
      }
    }
    for (const fn of mod.fns) {
      for (const p of fn.params) {
        if (p.type?.base.kind === 'named') referencedModels.add(p.type.base.name);
      }
      if (fn.returnType?.base.kind === 'named') {
        referencedModels.add(fn.returnType.base.name);
      }
    }
  }
  for (const [name] of symbols.models) {
    if (!referencedModels.has(name)) {
      items.push({
        id: 'completeness/orphan-model',
        category: 'Completeness',
        message: `Model "${name}" is not referenced by any intent or function.`,
        severity: 'info',
        subject: name,
      });
    }
  }
}

// ─── Error handling ───────────────────────────────────────

function checkErrorHandling(program: GistProgram, items: CheckItem[]): void {
  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      if (!intent.fails || intent.fails.length === 0) {
        items.push({
          id: 'errors/no-fails',
          category: 'Error handling',
          message: `Intent "${mod.name}.${intent.name}" has no fails: clause — error cases are unspecified.`,
          severity: 'info',
          subject: `${mod.name}.${intent.name}`,
        });
      }
    }
  }

  // Flows: stages without compensate
  for (const mod of program.modules) {
    for (const flow of mod.flows) {
      for (const stage of flow.stages) {
        if (!stage.compensate || stage.compensate.length === 0) {
          items.push({
            id: 'errors/no-compensate',
            category: 'Error handling',
            message: `Flow stage "${stage.name}" in "${mod.name}.${flow.name}" has no compensate: block.`,
            severity: 'info',
            subject: `${mod.name}.${flow.name}.${stage.name}`,
          });
        }
      }
    }
  }
}

// ─── Test coverage ────────────────────────────────────────

function checkTestCoverage(
  program: GistProgram,
  symbols: SymbolTable,
  items: CheckItem[],
): void {
  if (program.tests.length === 0 && program.modules.length > 0) {
    items.push({
      id: 'tests/no-tests',
      category: 'Test coverage',
      message: 'No test blocks found. Consider adding tests to verify intent behavior.',
      severity: 'warning',
    });
    return;
  }

  // Collect which intents are tested (by name mention in test step content)
  const testedNames = new Set<string>();
  for (const test of program.tests) {
    for (const step of test.steps) {
      if ('content' in step && typeof step.content === 'string') {
        testedNames.add(step.content);
      }
      // CallStep has .intent
      if (step.kind === 'call' && 'intent' in step) {
        testedNames.add((step as { intent: string }).intent);
      }
    }
  }

  // Check each module intent has at least one test reference
  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      if (!testedNames.has(intent.name) && !testedNames.has(`${mod.name}.${intent.name}`)) {
        items.push({
          id: 'tests/untested-intent',
          category: 'Test coverage',
          message: `Intent "${mod.name}.${intent.name}" has no corresponding test.`,
          severity: 'info',
          subject: `${mod.name}.${intent.name}`,
        });
      }
    }
  }
}

// ─── Guard coverage ───────────────────────────────────────

function checkGuardCoverage(program: GistProgram, items: CheckItem[]): void {
  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      if (intent.isPublic && (!intent.guard || intent.guard.length === 0)) {
        items.push({
          id: 'guards/public-no-guard',
          category: 'Guard coverage',
          message: `Public intent "${mod.name}.${intent.name}" has no guard: — anyone can access it.`,
          severity: 'warning',
          subject: `${mod.name}.${intent.name}`,
        });
      }
    }
  }
}

// ─── Underspecification ───────────────────────────────────

function checkUnderspecification(program: GistProgram, items: CheckItem[]): void {
  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      // must: without eg: examples
      if (intent.must && intent.must.length > 0 && (!intent.eg || intent.eg.length === 0)) {
        items.push({
          id: 'underspec/must-no-eg',
          category: 'Underspecification',
          message: `Intent "${mod.name}.${intent.name}" has must: constraints but no eg: examples — generation may misinterpret requirements.`,
          severity: 'info',
          subject: `${mod.name}.${intent.name}`,
        });
      }
    }
  }
}

// ─── Report formatting ───────────────────────────────────

const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export function formatChecklist(items: CheckItem[]): string {
  if (items.length === 0) {
    return `${BOLD}\x1b[32m✓ Spec quality checks passed — no issues found.\x1b[0m`;
  }

  const lines: string[] = [];
  const warnings = items.filter(i => i.severity === 'warning');
  const infos = items.filter(i => i.severity === 'info');

  // Group by category
  const byCategory = new Map<string, CheckItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  for (const [category, categoryItems] of byCategory) {
    lines.push(`${BOLD}${category}${RESET}`);
    for (const item of categoryItems) {
      const color = item.severity === 'warning' ? YELLOW : CYAN;
      const icon = item.severity === 'warning' ? '⚠' : 'ℹ';
      lines.push(`  ${color}${icon}${RESET} ${item.message}`);
    }
    lines.push('');
  }

  const parts: string[] = [];
  if (warnings.length > 0) parts.push(`${YELLOW}${warnings.length} warning${warnings.length !== 1 ? 's' : ''}${RESET}`);
  if (infos.length > 0) parts.push(`${CYAN}${infos.length} info${RESET}`);
  lines.push(`${DIM}Checklist:${RESET} ${parts.join(', ')}`);

  return lines.join('\n');
}

export function formatChecklistJson(items: CheckItem[]): string {
  return JSON.stringify(items, null, 2);
}
