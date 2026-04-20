import type { TextSpan } from '../common/source-location.js';
import type { Diagnostic } from '../common/diagnostics.js';
import type { Token } from '../lexer/tokens.js';

/**
 * CST node kinds. One-to-one with grammar productions from spec/gist-grammar.md.
 */
export enum CstKind {
  // Top-level
  Program = 'Program',
  ProjectDecl = 'ProjectDecl',

  // Project header blocks
  ContextLine = 'ContextLine',
  KitLine = 'KitLine',
  StackLine = 'StackLine',
  StyleBlock = 'StyleBlock',
  RulesBlock = 'RulesBlock',
  RulesEntry = 'RulesEntry',
  AlwaysBlock = 'AlwaysBlock',
  AlwaysLine = 'AlwaysLine',
  BeforeBlock = 'BeforeBlock',
  AfterBlock = 'AfterBlock',

  // Types
  TypeDecl = 'TypeDecl',
  Capabilities = 'Capabilities',
  CapabilityEntry = 'CapabilityEntry',

  // Traits
  TraitDecl = 'TraitDecl',

  // Models
  ModelDecl = 'ModelDecl',
  FieldDecl = 'FieldDecl',
  SpreadField = 'SpreadField',
  TtlDecl = 'TtlDecl',
  RetainDecl = 'RetainDecl',

  // Enums
  EnumDecl = 'EnumDecl',

  // Errors
  ErrorDecl = 'ErrorDecl',
  ErrorField = 'ErrorField',

  // Constants
  ConstDecl = 'ConstDecl',

  // State machines
  StateDecl = 'StateDecl',
  TransitionLine = 'TransitionLine',
  StateHook = 'StateHook',

  // Modules
  ModuleDecl = 'ModuleDecl',
  NeedsLine = 'NeedsLine',

  // Intents
  IntentDecl = 'IntentDecl',
  ParamList = 'ParamList',
  Param = 'Param',
  MetadataLine = 'MetadataLine',
  DoBlock = 'DoBlock',
  CodeBlock = 'CodeBlock',
  FailsBlock = 'FailsBlock',
  MustBlock = 'MustBlock',
  EnsureBlock = 'EnsureBlock',
  EgBlock = 'EgBlock',

  // Functions
  FnDecl = 'FnDecl',

  // Flows
  FlowDecl = 'FlowDecl',
  StageBlock = 'StageBlock',
  CompensateBlock = 'CompensateBlock',

  // Event handlers
  OnHandler = 'OnHandler',

  // Kit constructs
  KitConstruct = 'KitConstruct',
  KitBlock = 'KitBlock',

  // Tests
  TestDecl = 'TestDecl',
  GivenBlock = 'GivenBlock',
  CallStep = 'CallStep',
  TriggerStep = 'TriggerStep',
  ThenStep = 'ThenStep',
  ExpectStep = 'ExpectStep',
  ExpectAfterStep = 'ExpectAfterStep',
  ExpectClientStep = 'ExpectClientStep',
  MustFailStep = 'MustFailStep',
  AsContextStep = 'AsContextStep',

  // Type references
  TypeRef = 'TypeRef',

  // Composition
  UseDecl = 'UseDecl',
  ExtendDecl = 'ExtendDecl',
  RefineDecl = 'RefineDecl',
  PassDecl = 'PassDecl',

  // Common
  Literal = 'Literal',
  ArgList = 'ArgList',
  Arg = 'Arg',
  InlineObject = 'InlineObject',
  InlineField = 'InlineField',
  InlineList = 'InlineList',

  // Prose container
  ProseContent = 'ProseContent',

  // Error recovery
  ErrorNode = 'ErrorNode',
}

/**
 * A CST node preserves all tokens including trivia.
 * `children` contains both tokens and sub-nodes in source order.
 */
export interface CstNode {
  kind: CstKind;
  children: CstChild[];
  span: TextSpan;
  errors: Diagnostic[];
}

export type CstChild = CstNode | Token;

export function isCstNode(child: CstChild): child is CstNode {
  return 'kind' in child && 'children' in child;
}

export function isToken(child: CstChild): child is Token {
  return 'kind' in child && 'text' in child && !('children' in child);
}
