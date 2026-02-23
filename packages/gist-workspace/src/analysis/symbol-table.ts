import type { TextSpan, TypeRef } from '@gist-lang/parser';
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
import type { GistProjectConfig, ServiceConfig } from '../types.js';

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

// ─── Reference tracking ──────────────────────────────────────

export type ReferenceKind =
  | 'type_ref'        // field type, param type, return type
  | 'model_ref'       // ->Model reference
  | 'spread_ref'      // ...TraitName
  | 'saves_ref'       // saves: ModelName
  | 'needs_ref'       // needs: ModelName
  | 'uses_ref'        // uses: serviceName
  | 'state_for_ref'   // state X for Model.field
  | 'base_type_ref';  // type X = BaseType

export interface SymbolReference {
  /** The name being referenced. */
  name: string;
  /** What kind of reference this is. */
  kind: ReferenceKind;
  /** Location of the reference in source. */
  span: TextSpan;
  /** Context: which module/declaration contains this reference. */
  context?: string;
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

  /** All references to symbols, keyed by the referenced name. */
  private references = new Map<string, SymbolReference[]>();

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

    // Collect references
    table.collectReferences(program);

    return table;
  }

  // ─── Reference collection ─────────────────────────────────

  private collectReferences(program: GistProgram): void {
    // Model field types + spreads
    for (const m of program.models) {
      for (const field of m.fields) {
        if (field.type) {
          this.collectTypeRefReferences(field.type, m.name);
        }
      }
      for (const spread of m.spreads) {
        // spreads are string names — we need to find their span in the AST
        // The spread span is approximated from the model span
        // For now we store a reference with a synthetic span from the model
        this.addReference({
          name: spread,
          kind: 'spread_ref',
          span: m.span, // approximate — individual spread spans aren't available
          context: m.name,
        });
      }
    }

    // Trait field types
    for (const t of program.traits) {
      for (const field of t.fields) {
        if (field.type) {
          this.collectTypeRefReferences(field.type, t.name);
        }
      }
    }

    // Error field types
    for (const e of program.errors) {
      for (const field of e.fields) {
        if (field.type) {
          this.collectTypeRefReferences(field.type, e.name);
        }
      }
    }

    // Type alias base type
    for (const t of program.types) {
      if (t.baseType) {
        this.collectTypeRefReferences(t.baseType, t.name);
      }
    }

    // State machine for-model reference
    for (const sm of program.stateMachines) {
      if (sm.forModel) {
        this.addReference({
          name: sm.forModel,
          kind: 'state_for_ref',
          span: sm.span,
          context: sm.name,
        });
      }
    }

    // Module intents/fns/flows
    for (const mod of program.modules) {
      // needs: references
      for (const need of mod.needs) {
        this.addReference({
          name: need,
          kind: 'needs_ref',
          span: mod.span,
          context: mod.name,
        });
      }

      for (const intent of mod.intents) {
        const ctx = `${mod.name}.${intent.name}`;
        // Param types
        for (const p of intent.params) {
          if (p.type) this.collectTypeRefReferences(p.type, ctx);
        }
        // Return type
        if (intent.returnType) {
          this.collectTypeRefReferences(intent.returnType, ctx);
        }
        // saves: references
        if (intent.saves) {
          for (const s of intent.saves) {
            this.addReference({ name: s, kind: 'saves_ref', span: intent.span, context: ctx });
          }
        }
        // uses: references
        if (intent.uses) {
          for (const u of intent.uses) {
            this.addReference({ name: u, kind: 'uses_ref', span: intent.span, context: ctx });
          }
        }
      }

      for (const fn of mod.fns) {
        const ctx = `${mod.name}.${fn.name}`;
        for (const p of fn.params) {
          if (p.type) this.collectTypeRefReferences(p.type, ctx);
        }
        if (fn.returnType) {
          this.collectTypeRefReferences(fn.returnType, ctx);
        }
      }

      for (const flow of mod.flows) {
        const ctx = `${mod.name}.${flow.name}`;
        for (const p of flow.params) {
          if (p.type) this.collectTypeRefReferences(p.type, ctx);
        }
        if (flow.returnType) {
          this.collectTypeRefReferences(flow.returnType, ctx);
        }
      }
    }
  }

  private collectTypeRefReferences(typeRef: TypeRef, context: string): void {
    const base = typeRef.base;
    if (base.kind === 'named') {
      this.addReference({
        name: base.name,
        kind: 'type_ref',
        span: typeRef.span,
        context,
      });
    } else if (base.kind === 'model_ref') {
      this.addReference({
        name: base.target,
        kind: 'model_ref',
        span: typeRef.span,
        context,
      });
    } else if (base.kind === 'result' && base.inner) {
      this.collectTypeRefReferences(base.inner, context);
    } else if (base.kind === 'map') {
      if (base.key) this.collectTypeRefReferences(base.key, context);
      if (base.value) this.collectTypeRefReferences(base.value, context);
    } else if (base.kind === 'inline_struct') {
      for (const f of base.fields) {
        if (f.type) this.collectTypeRefReferences(f.type, context);
      }
    }

    // Union members
    if (typeRef.union) {
      for (const u of typeRef.union) {
        this.collectTypeRefReferences(u, context);
      }
    }
  }

  private addReference(ref: SymbolReference): void {
    const existing = this.references.get(ref.name);
    if (existing) {
      existing.push(ref);
    } else {
      this.references.set(ref.name, [ref]);
    }
  }

  // ─── Symbol registration ──────────────────────────────────

  private addSymbol(info: SymbolInfo): void {
    const existing = this.symbols.get(info.name);
    if (existing) {
      existing.push(info);
    } else {
      this.symbols.set(info.name, [info]);
    }
  }

  // ─── Query methods ────────────────────────────────────────

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

  /** Get all references to a given name. */
  getReferences(name: string): SymbolReference[] {
    return this.references.get(name) ?? [];
  }

  /** Get all symbol declarations and their infos. */
  getAllSymbols(): Map<string, SymbolInfo[]> {
    return this.symbols;
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
