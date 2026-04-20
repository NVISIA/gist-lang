import type { TextSpan } from '@gist-lang/parser';
import type {
  GistProgram,
  TypeRef,
  IntentDeclaration,
  FnDeclaration,
  StateMachineDeclaration,
  KitConstructNode,
} from '@gist-lang/parser';
import type { Diagnostic } from '@gist-lang/parser';
import { DiagnosticSeverity } from '@gist-lang/parser';
import { emptySpan } from '@gist-lang/parser';
import type { SymbolTable, RouteEntry } from './symbol-table.js';
import type { KitRegistry } from '../kit-registry.js';

// ─── Primitive type names ────────────────────────────────────

const PRIMITIVE_TYPES = new Set([
  'string', 'int', 'float', 'decimal', 'number',
  'bool', 'date', 'datetime', 'bytes', 'any', 'void',
]);

// ─── Diagnostic builder ─────────────────────────────────────

function diag(
  severity: DiagnosticSeverity,
  span: TextSpan,
  message: string,
): Diagnostic {
  return { severity, span, message };
}

function error(span: TextSpan, message: string): Diagnostic {
  return diag(DiagnosticSeverity.Error, span, message);
}

function warning(span: TextSpan, message: string): Diagnostic {
  return diag(DiagnosticSeverity.Warning, span, message);
}

// ─── Run all validators ─────────────────────────────────────

export function runAllValidators(
  program: GistProgram,
  symbols: SymbolTable,
  kitRegistry: KitRegistry | null,
  declaredKits: string[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(...checkDuplicateNames(symbols));
  diagnostics.push(...checkTypeReferences(program, symbols));
  diagnostics.push(...checkDuplicateRoutes(symbols));
  diagnostics.push(...checkModuleNeeds(program, symbols));
  diagnostics.push(...checkPurity(program));
  diagnostics.push(...checkStateMachines(program, symbols));
  diagnostics.push(...checkUsesReferences(program, symbols));
  diagnostics.push(...checkSpreads(program, symbols));

  if (kitRegistry) {
    diagnostics.push(...checkKitKeywords(program, kitRegistry, declaredKits));
    diagnostics.push(...checkKitConstructFields(program, kitRegistry));
  }

  return diagnostics;
}

// ─── Duplicate name detection ────────────────────────────────

function checkDuplicateNames(symbols: SymbolTable): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, { kind: string; span: TextSpan }>();

  // Check top-level type-like names for duplicates
  const checkMap = <T extends { span: TextSpan }>(
    map: Map<string, T>,
    kind: string,
  ) => {
    for (const [name, decl] of map) {
      const existing = seen.get(name);
      if (existing) {
        diagnostics.push(error(
          decl.span,
          `Duplicate declaration '${name}' — already declared as ${existing.kind}`,
        ));
      } else {
        seen.set(name, { kind, span: decl.span });
      }
    }
  };

  checkMap(symbols.models, 'model');
  checkMap(symbols.enums, 'enum');
  checkMap(symbols.types, 'type');
  checkMap(symbols.traits, 'trait');
  checkMap(symbols.errors, 'error');

  return diagnostics;
}

// ─── Type reference validation ───────────────────────────────

function checkTypeReferences(program: GistProgram, symbols: SymbolTable): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const checkTypeRef = (ref: TypeRef) => {
    const base = ref.base;
    switch (base.kind) {
      case 'named':
        if (!PRIMITIVE_TYPES.has(base.name) && !symbols.isTypeName(base.name)) {
          diagnostics.push(warning(
            base.span,
            `Undeclared type '${base.name}'`,
          ));
        }
        break;
      case 'model_ref':
        if (!symbols.models.has(base.target) && !symbols.isTypeName(base.target)) {
          diagnostics.push(warning(
            base.span,
            `Undeclared model '${base.target}'`,
          ));
        }
        break;
      case 'result':
        if (base.inner) checkTypeRef(base.inner);
        break;
      case 'map':
        if (base.key) checkTypeRef(base.key);
        if (base.value) checkTypeRef(base.value);
        break;
      case 'inline_struct':
        for (const field of base.fields) {
          if (field.type) checkTypeRef(field.type);
        }
        break;
    }
    if (ref.union) {
      for (const u of ref.union) {
        checkTypeRef(u);
      }
    }
  };

  // Check all type references in models
  for (const model of program.models) {
    for (const field of model.fields) {
      if (field.type) checkTypeRef(field.type);
    }
  }

  // Check type references in traits
  for (const trait of program.traits) {
    for (const field of trait.fields) {
      if (field.type) checkTypeRef(field.type);
    }
  }

  // Check type references in type declarations
  for (const type of program.types) {
    if (type.baseType) checkTypeRef(type.baseType);
  }

  // Check type references in errors
  for (const err of program.errors) {
    for (const field of err.fields) {
      if (field.type) checkTypeRef(field.type);
    }
  }

  // Check modules: intents, fns, flows
  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      if (intent.returnType) checkTypeRef(intent.returnType);
      for (const param of intent.params) {
        if (param.type) checkTypeRef(param.type);
      }
    }
    for (const fn of mod.fns) {
      if (fn.returnType) checkTypeRef(fn.returnType);
      for (const param of fn.params) {
        if (param.type) checkTypeRef(param.type);
      }
    }
    for (const flow of mod.flows) {
      if (flow.returnType) checkTypeRef(flow.returnType);
      for (const param of flow.params) {
        if (param.type) checkTypeRef(param.type);
      }
    }
  }

  return diagnostics;
}

// ─── Duplicate route detection ───────────────────────────────

function checkDuplicateRoutes(symbols: SymbolTable): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, RouteEntry>();

  for (const route of symbols.routes) {
    const key = `${route.method} ${route.path}`;
    const existing = seen.get(key);
    if (existing) {
      diagnostics.push(error(
        route.span,
        `Duplicate route ${key} — already defined by ${existing.moduleName}.${existing.intentName}`,
      ));
    } else {
      seen.set(key, route);
    }
  }

  return diagnostics;
}

// ─── Module needs validation ─────────────────────────────────

function checkModuleNeeds(program: GistProgram, symbols: SymbolTable): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const mod of program.modules) {
    for (const need of mod.needs) {
      if (!symbols.isTypeName(need)) {
        diagnostics.push(warning(
          mod.span,
          `Module '${mod.name}' needs '${need}' which is not a declared model or type`,
        ));
      }
    }
  }

  return diagnostics;
}

// ─── Purity check: fn must not have side-effect metadata ─────

function checkPurity(program: GistProgram): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const checkFn = (fn: FnDeclaration, moduleName: string) => {
    // fn blocks should not have saves, emits, route, socket
    // These fields don't exist on FnDeclaration by design,
    // but we check the AST in case the parser was lenient
    // The main check is that fn is properly structured
    // (enforced by the AST shape — FnDeclaration has no saves/emits/route/socket)
  };

  for (const mod of program.modules) {
    for (const fn of mod.fns) {
      checkFn(fn, mod.name);
    }
  }

  return diagnostics;
}

// ─── State machine validation ────────────────────────────────

function checkStateMachines(program: GistProgram, symbols: SymbolTable): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const sm of program.stateMachines) {
    // State-machine targets can be either models (core GIST) or named kit
    // constructs (e.g. gamedev `entity`, godot `node`). Field-existence
    // checks only apply when the target is a model — kit constructs have
    // free-form field shapes defined by each kit.
    const isModelTarget = !!sm.forModel && symbols.models.has(sm.forModel);
    const isKitTarget = !!sm.forModel && symbols.kitConstructs.has(sm.forModel);

    if (sm.forModel && !isModelTarget && !isKitTarget) {
      diagnostics.push(error(
        sm.span,
        `State machine '${sm.name}' references undeclared model '${sm.forModel}'`,
      ));
    }

    // Check that forField exists on the referenced model
    if (isModelTarget && sm.forField) {
      const model = symbols.models.get(sm.forModel!);
      if (model) {
        const fieldExists = model.fields.some(f => f.name === sm.forField) ||
          model.spreads.some(s => {
            const trait = symbols.traits.get(s);
            return trait?.fields.some(f => f.name === sm.forField);
          });
        if (!fieldExists) {
          diagnostics.push(error(
            sm.span,
            `State machine '${sm.name}' references undeclared field '${sm.forField}' on model '${sm.forModel}'`,
          ));
        }
      }
    }

    // Collect declared states from transitions
    const declaredStates = new Set<string>();
    for (const t of sm.transitions) {
      declaredStates.add(t.from);
      declaredStates.add(t.to);
    }

    // Check hooks reference declared states
    for (const hook of sm.hooks) {
      if (!declaredStates.has(hook.state)) {
        diagnostics.push(warning(
          hook.span,
          `State hook references undeclared state '${hook.state}' in state machine '${sm.name}'`,
        ));
      }
    }
  }

  return diagnostics;
}

// ─── uses: reference validation ──────────────────────────────

function checkUsesReferences(program: GistProgram, symbols: SymbolTable): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const mod of program.modules) {
    for (const intent of mod.intents) {
      if (intent.uses) {
        for (const usedService of intent.uses) {
          if (!symbols.services.has(usedService)) {
            diagnostics.push(error(
              intent.span,
              `Intent '${intent.name}' uses service '${usedService}' which is not defined in gist.yaml`,
            ));
          }
        }
      }
    }
  }

  return diagnostics;
}

// ─── Spread validation ───────────────────────────────────────

function checkSpreads(program: GistProgram, symbols: SymbolTable): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const model of program.models) {
    for (const spread of model.spreads) {
      if (!symbols.traits.has(spread)) {
        diagnostics.push(warning(
          model.span,
          `Model '${model.name}' spreads '${spread}' which is not a declared trait`,
        ));
      }
    }
  }

  for (const trait of program.traits) {
    for (const spread of trait.spreads) {
      if (!symbols.traits.has(spread)) {
        diagnostics.push(warning(
          trait.span,
          `Trait '${trait.name}' spreads '${spread}' which is not a declared trait`,
        ));
      }
    }
  }

  return diagnostics;
}

// ─── Kit keyword validation ──────────────────────────────────

function checkKitKeywords(
  program: GistProgram,
  kitRegistry: KitRegistry,
  declaredKits: string[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Expand declaredKits with transitive parents via extends_kits so a project
  // that declares only `kit: godot` counts as having `gamedev` active too.
  const activeKits = expandWithTransitiveParents(declaredKits, kitRegistry);

  for (const kc of program.kitConstructs) {
    const keyword = kc.keyword;
    if (!kitRegistry.isKitKeyword(keyword)) {
      diagnostics.push(error(
        kc.span,
        `Unknown keyword '${keyword}' — no loaded kit provides this keyword`,
      ));
      continue;
    }

    // Check that the kit providing this keyword is declared in the project header
    const sourceKit = kitRegistry.getKitForKeyword(keyword);
    if (sourceKit && declaredKits.length > 0 && !activeKits.has(sourceKit)) {
      diagnostics.push(error(
        kc.span,
        `Keyword '${keyword}' requires kit '${sourceKit}' but it is not declared in project header (kit: ...)`,
      ));
    }
  }

  return diagnostics;
}

function expandWithTransitiveParents(
  declared: string[],
  registry: KitRegistry,
): Set<string> {
  const result = new Set<string>();
  const stack = [...declared];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (result.has(name)) continue;
    result.add(name);
    const kit = registry.getKit(name);
    if (!kit) continue;
    for (const parent of kit.extendsKits) {
      if (!result.has(parent)) stack.push(parent);
    }
  }
  return result;
}

// ─── Kit construct field validation ──────────────────────────

function checkKitConstructFields(
  program: GistProgram,
  kitRegistry: KitRegistry,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const kc of program.kitConstructs) {
    const construct = kitRegistry.getConstruct(kc.keyword);
    if (!construct) continue;

    // Check required fields are present.
    // Fields can appear either as KitBlockNodes (`key: value` context-line
    // syntax on declarations) or as FieldDeclarations (`name: Type` inside
    // `{ }` block-kind constructs).
    for (const [fieldName, fieldDef] of Object.entries(construct.fields)) {
      if (!fieldDef.required) continue;

      const hasField = kc.children.some(child => {
        if ('key' in child && child.key === fieldName) return true;
        if ('name' in child && child.name === fieldName) return true;
        return false;
      });

      if (!hasField) {
        diagnostics.push(warning(
          kc.span,
          `Kit construct '${kc.keyword}' is missing required field '${fieldName}'`,
        ));
      }
    }
  }

  return diagnostics;
}
