import type { TextSpan } from '@gist-lang/parser';
import type {
  GistProgram,
  ModelDeclaration,
  EnumDeclaration,
  TypeDeclaration,
  TraitDeclaration,
  ErrorDeclaration,
  ConstantDeclaration,
  StateMachineDeclaration,
  ModuleDeclaration,
  IntentDeclaration,
  FnDeclaration,
  FlowDeclaration,
  KitConstructNode,
  TestDeclaration,
  FieldDeclaration,
} from '@gist-lang/parser';
import type { GistProjectConfig, ServiceConfig } from '../workspace/types.js';

// ─── Symbol kinds ────────────────────────────────────────────

export type SymbolKind =
  | 'model'
  | 'enum'
  | 'type'
  | 'trait'
  | 'error'
  | 'constant'
  | 'state_machine'
  | 'module'
  | 'intent'
  | 'fn'
  | 'flow'
  | 'kit_construct'
  | 'test'
  | 'service';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  span: TextSpan;
  /** For module-scoped symbols, the containing module name. */
  module?: string;
}

// ─── Route entry for duplicate detection ─────────────────────

export interface RouteEntry {
  method: string;
  path: string;
  intentName: string;
  moduleName: string;
  span: TextSpan;
}

// ─── Symbol Table ────────────────────────────────────────────

export class SymbolTable {
  private symbols = new Map<string, SymbolInfo[]>();

  // Quick lookups by kind
  readonly models = new Map<string, ModelDeclaration>();
  readonly enums = new Map<string, EnumDeclaration>();
  readonly types = new Map<string, TypeDeclaration>();
  readonly traits = new Map<string, TraitDeclaration>();
  readonly errors = new Map<string, ErrorDeclaration>();
  readonly constants = new Map<string, ConstantDeclaration>();
  readonly stateMachines = new Map<string, StateMachineDeclaration>();
  readonly modules = new Map<string, ModuleDeclaration>();
  readonly kitConstructs = new Map<string, KitConstructNode>();
  readonly tests = new Map<string, TestDeclaration>();
  readonly services = new Map<string, ServiceConfig>();
  readonly routes: RouteEntry[] = [];

  /** All intents across all modules, keyed by "ModuleName.IntentName" */
  readonly intents = new Map<string, { intent: IntentDeclaration; module: string }>();
  /** All fns across all modules */
  readonly fns = new Map<string, { fn: FnDeclaration; module: string }>();
  /** All flows across all modules */
  readonly flows = new Map<string, { flow: FlowDeclaration; module: string }>();

  /**
   * Build the symbol table from an AST program and optional project config.
   */
  static build(program: GistProgram, config?: GistProjectConfig | null): SymbolTable {
    const table = new SymbolTable();

    // Models
    for (const m of program.models) {
      table.addSymbol({ name: m.name, kind: 'model', span: m.span });
      table.models.set(m.name, m);
    }

    // Enums
    for (const e of program.enums) {
      table.addSymbol({ name: e.name, kind: 'enum', span: e.span });
      table.enums.set(e.name, e);
    }

    // Types
    for (const t of program.types) {
      table.addSymbol({ name: t.name, kind: 'type', span: t.span });
      table.types.set(t.name, t);
    }

    // Traits
    for (const t of program.traits) {
      table.addSymbol({ name: t.name, kind: 'trait', span: t.span });
      table.traits.set(t.name, t);
    }

    // Errors
    for (const e of program.errors) {
      table.addSymbol({ name: e.name, kind: 'error', span: e.span });
      table.errors.set(e.name, e);
    }

    // Constants
    for (const c of program.constants) {
      table.addSymbol({ name: c.name, kind: 'constant', span: c.span });
      table.constants.set(c.name, c);
    }

    // State machines
    for (const sm of program.stateMachines) {
      table.addSymbol({ name: sm.name, kind: 'state_machine', span: sm.span });
      table.stateMachines.set(sm.name, sm);
    }

    // Modules (and their nested intents/fns/flows)
    for (const mod of program.modules) {
      table.addSymbol({ name: mod.name, kind: 'module', span: mod.span });
      table.modules.set(mod.name, mod);

      for (const intent of mod.intents) {
        const qualName = `${mod.name}.${intent.name}`;
        table.addSymbol({ name: intent.name, kind: 'intent', span: intent.span, module: mod.name });
        table.intents.set(qualName, { intent, module: mod.name });

        // Collect routes
        if (intent.route) {
          table.routes.push({
            method: intent.route.method,
            path: intent.route.path,
            intentName: intent.name,
            moduleName: mod.name,
            span: intent.route.span,
          });
        }
      }

      for (const fn of mod.fns) {
        const qualName = `${mod.name}.${fn.name}`;
        table.addSymbol({ name: fn.name, kind: 'fn', span: fn.span, module: mod.name });
        table.fns.set(qualName, { fn, module: mod.name });
      }

      for (const flow of mod.flows) {
        const qualName = `${mod.name}.${flow.name}`;
        table.addSymbol({ name: flow.name, kind: 'flow', span: flow.span, module: mod.name });
        table.flows.set(qualName, { flow, module: mod.name });
      }
    }

    // Kit constructs
    for (const kc of program.kitConstructs) {
      if (kc.name) {
        table.addSymbol({ name: kc.name, kind: 'kit_construct', span: kc.span });
        table.kitConstructs.set(kc.name, kc);
      }
    }

    // Tests
    for (const t of program.tests) {
      table.addSymbol({ name: t.name, kind: 'test', span: t.span });
      table.tests.set(t.name, t);
    }

    // Services from gist.yaml
    if (config?.services) {
      for (const [name, svc] of Object.entries(config.services)) {
        table.services.set(name, svc);
      }
    }

    return table;
  }

  private addSymbol(info: SymbolInfo): void {
    const existing = this.symbols.get(info.name);
    if (existing) {
      existing.push(info);
    } else {
      this.symbols.set(info.name, [info]);
    }
  }

  /** Check if a name is declared as any kind of type-like symbol (model, enum, type, trait, error). */
  isTypeName(name: string): boolean {
    return this.models.has(name) || this.enums.has(name) ||
           this.types.has(name) || this.traits.has(name) ||
           this.errors.has(name);
  }

  /** Check if a name is declared anywhere. */
  isDeclared(name: string): boolean {
    return this.symbols.has(name);
  }

  /** Get all declarations of a name. */
  getSymbols(name: string): SymbolInfo[] {
    return this.symbols.get(name) ?? [];
  }

  /** Get all declared names. */
  getAllNames(): string[] {
    return [...this.symbols.keys()];
  }

  /** Get all type-position names (models, enums, types, traits). */
  getAllTypeNames(): string[] {
    const names: string[] = [];
    for (const n of this.models.keys()) names.push(n);
    for (const n of this.enums.keys()) names.push(n);
    for (const n of this.types.keys()) names.push(n);
    for (const n of this.traits.keys()) names.push(n);
    return names;
  }

  /** Get resolved fields for a model, including trait spreads. */
  getResolvedFields(modelName: string): FieldDeclaration[] {
    const model = this.models.get(modelName);
    if (!model) return [];

    const fields = [...model.fields];
    for (const spreadName of model.spreads) {
      const trait = this.traits.get(spreadName);
      if (trait) {
        fields.push(...trait.fields);
      }
    }
    return fields;
  }
}
