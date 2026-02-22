import type { TextSpan } from '../common/source-location.js';

// ─── Base ────────────────────────────────────────────────────

export interface AstNode {
  span: TextSpan;
}

// ─── Program ────────────────────────────────────────────────

export interface GistProgram extends AstNode {
  project?: ProjectHeader;
  types: TypeDeclaration[];
  traits: TraitDeclaration[];
  models: ModelDeclaration[];
  enums: EnumDeclaration[];
  errors: ErrorDeclaration[];
  constants: ConstantDeclaration[];
  stateMachines: StateMachineDeclaration[];
  modules: ModuleDeclaration[];
  tests: TestDeclaration[];
  kitConstructs: KitConstructNode[];
  compositions: CompositionNode[];
  onHandlers: OnHandlerNode[];
}

// ─── Project Header ─────────────────────────────────────────

export interface ProjectHeader extends AstNode {
  name: string;
  context: string[];
  kit?: string[];
  stack?: string;
  style?: string[];
  rules?: RulesEntry[];
  always?: string[];
  before?: string[];
  after?: string[];
}

export interface RulesEntry extends AstNode {
  name: string;
  body: string;
}

// ─── Type Declaration ───────────────────────────────────────

export interface TypeDeclaration extends AstNode {
  name: string;
  baseType?: TypeRef;
  capabilities?: CapabilityEntry[];
}

export interface CapabilityEntry extends AstNode {
  name: string;
  value: string;
}

// ─── Trait Declaration ──────────────────────────────────────

export interface TraitDeclaration extends AstNode {
  name: string;
  fields: FieldDeclaration[];
  spreads: string[];
  always?: string[];
}

// ─── Model Declaration ──────────────────────────────────────

export interface ModelDeclaration extends AstNode {
  name: string;
  modifier?: 'ephemeral' | 'immutable';
  fields: FieldDeclaration[];
  spreads: string[];
  ttl?: string;
  retain?: string;
  always?: string[];
}

export interface FieldDeclaration extends AstNode {
  name: string;
  type?: TypeRef;
  optional: boolean;
  modifiers: string[];
  defaultValue?: string;
  description?: string;
}

// ─── Enum Declaration ───────────────────────────────────────

export interface EnumDeclaration extends AstNode {
  name: string;
  values: string[];
}

// ─── Error Declaration ──────────────────────────────────────

export interface ErrorDeclaration extends AstNode {
  name: string;
  fields: ErrorFieldNode[];
}

export interface ErrorFieldNode extends AstNode {
  name: string;
  type?: TypeRef;
}

// ─── Constant Declaration ───────────────────────────────────

export interface ConstantDeclaration extends AstNode {
  name: string;
  value: string;
}

// ─── State Machine Declaration ──────────────────────────────

export interface StateMachineDeclaration extends AstNode {
  name: string;
  forModel?: string;
  forField?: string;
  transitions: TransitionNode[];
  hooks: StateHookNode[];
}

export interface TransitionNode extends AstNode {
  from: string;
  to: string;
}

export interface StateHookNode extends AstNode {
  event: string;
  state: string;
  body: string[];
}

// ─── Module Declaration ─────────────────────────────────────

export interface ModuleDeclaration extends AstNode {
  name: string;
  context: string[];
  needs: string[];
  before?: string[];
  after?: string[];
  intents: IntentDeclaration[];
  fns: FnDeclaration[];
  flows: FlowDeclaration[];
  onHandlers: OnHandlerNode[];
}

// ─── Intent Declaration ─────────────────────────────────────

export interface IntentDeclaration extends AstNode {
  name: string;
  params: ParamNode[];
  returnType?: TypeRef;
  route?: RouteInfo;
  saves?: string[];
  emits?: string[];
  uses?: string[];
  needs?: string[];
  guard?: string[];
  socket?: string;
  schedule?: string;
  isPublic: boolean;
  isAsync: boolean;
  trace: boolean;
  doBlock?: string[];
  codeBlock?: string[];
  must?: string[];
  ensure?: string[];
  eg?: string[];
  fails?: string[];
}

export interface ParamNode extends AstNode {
  name: string;
  type?: TypeRef;
  optional: boolean;
  defaultValue?: string;
}

export interface RouteInfo extends AstNode {
  method: string;
  path: string;
}

// ─── Function Declaration ───────────────────────────────────

export interface FnDeclaration extends AstNode {
  name: string;
  params: ParamNode[];
  returnType?: TypeRef;
  doBlock?: string[];
  codeBlock?: string[];
  must?: string[];
  ensure?: string[];
  eg?: string[];
}

// ─── Flow Declaration ───────────────────────────────────────

export interface FlowDeclaration extends AstNode {
  name: string;
  params: ParamNode[];
  returnType?: TypeRef;
  stages: StageNode[];
  must?: string[];
  ensure?: string[];
  metadata: MetadataEntry[];
}

export interface StageNode extends AstNode {
  name: string;
  body: string[];
  compensate?: string[];
}

export interface MetadataEntry extends AstNode {
  key: string;
  value: string;
}

// ─── Event Handler ──────────────────────────────────────────

export interface OnHandlerNode extends AstNode {
  event: string;
  body: string[];
}

// ─── Kit Construct ──────────────────────────────────────────

export interface KitConstructNode extends AstNode {
  keyword: string;
  name?: string;
  inlineContent: string;
  children: KitConstructChild[];
}

export type KitConstructChild =
  | KitConstructNode
  | KitBlockNode
  | IntentDeclaration
  | FnDeclaration
  | FlowDeclaration
  | OnHandlerNode
  | FieldDeclaration;

export interface KitBlockNode extends AstNode {
  key: string;
  value: string;
}

// ─── Test Declaration ───────────────────────────────────────

export interface TestDeclaration extends AstNode {
  name: string;
  steps: TestStep[];
}

export type TestStep =
  | GivenStep
  | CallStep
  | TriggerStep
  | ThenStep
  | ExpectStep
  | MustFailStep
  | AsContextStep;

export interface GivenStep extends AstNode {
  kind: 'given';
  content: string;
}

export interface CallStep extends AstNode {
  kind: 'call';
  content: string;
}

export interface TriggerStep extends AstNode {
  kind: 'trigger';
  content: string;
}

export interface ThenStep extends AstNode {
  kind: 'then';
  step: CallStep | TriggerStep;
}

export interface ExpectStep extends AstNode {
  kind: 'expect';
  content: string;
}

export interface MustFailStep extends AstNode {
  kind: 'must_fail';
  content: string;
}

export interface AsContextStep extends AstNode {
  kind: 'as_context';
  role: string;
  scope: string;
}

// ─── Type References ────────────────────────────────────────

export interface TypeRef extends AstNode {
  base: BaseTypeRef;
  optional: boolean;
  array: boolean;
  union?: TypeRef[];
}

export type BaseTypeRef =
  | PrimitiveTypeRef
  | NamedTypeRef
  | ModelRefTypeRef
  | ErrorTypeRef
  | ResultTypeRef
  | MapTypeRef
  | InlineStructTypeRef;

export interface PrimitiveTypeRef extends AstNode {
  kind: 'primitive';
  name: string;
}

export interface NamedTypeRef extends AstNode {
  kind: 'named';
  name: string;
}

export interface ModelRefTypeRef extends AstNode {
  kind: 'model_ref';
  target: string;
}

export interface ErrorTypeRef extends AstNode {
  kind: 'error';
}

export interface ResultTypeRef extends AstNode {
  kind: 'result';
  inner?: TypeRef;
}

export interface MapTypeRef extends AstNode {
  kind: 'map';
  key?: TypeRef;
  value?: TypeRef;
}

export interface InlineStructTypeRef extends AstNode {
  kind: 'inline_struct';
  fields: FieldDeclaration[];
}

// ─── Composition ────────────────────────────────────────────

export type CompositionNode =
  | UseNode
  | ExtendNode
  | RefineNode;

export interface UseNode extends AstNode {
  compositionKind: 'use';
  target: string;
}

export interface ExtendNode extends AstNode {
  compositionKind: 'extend';
  target: string;
  body: string[];
}

export interface RefineNode extends AstNode {
  compositionKind: 'refine';
  target: string;
  body: string[];
}
