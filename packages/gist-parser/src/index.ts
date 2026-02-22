// Common types
export type { Position, TextSpan } from './common/source-location.js';
export { emptySpan, mergeSpans } from './common/source-location.js';
export type { Diagnostic } from './common/diagnostics.js';
export { DiagnosticSeverity } from './common/diagnostics.js';

// Lexer
export { TokenKind, KEYWORDS, HTTP_METHODS, PROSE_BLOCK_KEYWORDS } from './lexer/tokens.js';
export type { Token } from './lexer/tokens.js';
export { lex } from './lexer/lexer.js';
export type { LexerOptions, LexResult } from './lexer/lexer.js';
export { IndentTracker } from './lexer/indent-tracker.js';

// Parser
export { CstKind, isCstNode, isToken } from './parser/cst-nodes.js';
export type { CstNode, CstChild } from './parser/cst-nodes.js';
export { parse } from './parser/parser.js';
export type { ParseResult } from './parser/parser.js';

// AST
export { cstToAst } from './ast/cst-to-ast.js';
export type {
  GistProgram,
  ProjectHeader,
  RulesEntry,
  TypeDeclaration,
  CapabilityEntry,
  TraitDeclaration,
  ModelDeclaration,
  FieldDeclaration,
  EnumDeclaration,
  ErrorDeclaration,
  ErrorFieldNode,
  ConstantDeclaration,
  StateMachineDeclaration,
  TransitionNode,
  StateHookNode,
  ModuleDeclaration,
  IntentDeclaration,
  ParamNode,
  RouteInfo,
  FnDeclaration,
  FlowDeclaration,
  StageNode,
  MetadataEntry,
  OnHandlerNode,
  KitConstructNode,
  KitConstructChild,
  KitBlockNode,
  TestDeclaration,
  TestStep,
  GivenStep,
  CallStep,
  TriggerStep,
  ThenStep,
  ExpectStep,
  MustFailStep,
  AsContextStep,
  TypeRef,
  BaseTypeRef,
  PrimitiveTypeRef,
  NamedTypeRef,
  ModelRefTypeRef,
  ErrorTypeRef,
  ResultTypeRef,
  MapTypeRef,
  InlineStructTypeRef,
  CompositionNode,
  UseNode,
  ExtendNode,
  RefineNode,
} from './ast/ast-nodes.js';
