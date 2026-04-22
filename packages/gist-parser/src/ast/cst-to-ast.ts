import type { TextSpan } from '../common/source-location.js';
import { emptySpan } from '../common/source-location.js';
import { CstKind, isCstNode, isToken, type CstNode, type CstChild } from '../parser/cst-nodes.js';
import { TokenKind, type Token } from '../lexer/tokens.js';
import type {
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
  CompositionNode,
  UseNode,
  ExtendNode,
  RefineNode,
  ExposedName,
  SpreadRef,
} from './ast-nodes.js';

// ─── Public API ───────────────────────────────────────────────

export function cstToAst(cst: CstNode): GistProgram {
  return transformProgram(cst);
}

// ─── Helpers ──────────────────────────────────────────────────

const TRIVIA_KINDS = new Set([
  TokenKind.NEWLINE, TokenKind.LINE_COMMENT, TokenKind.BLOCK_COMMENT,
  TokenKind.INDENT, TokenKind.DEDENT, TokenKind.EOF,
]);

const PRIMITIVE_TOKENS = new Set([
  TokenKind.KW_STRING, TokenKind.KW_INT, TokenKind.KW_FLOAT,
  TokenKind.KW_DECIMAL, TokenKind.KW_NUMBER, TokenKind.KW_BOOL,
  TokenKind.KW_DATE, TokenKind.KW_DATETIME, TokenKind.KW_BYTES,
  TokenKind.KW_ANY, TokenKind.KW_VOID,
]);

/** Get all direct child tokens from a CST node, excluding trivia. */
function tokens(node: CstNode): Token[] {
  return node.children.filter(
    (c): c is Token => isToken(c) && !TRIVIA_KINDS.has(c.kind)
  );
}

/** Get all direct child CST nodes of a specific kind. */
function childNodes(node: CstNode, kind: CstKind): CstNode[] {
  return node.children.filter(
    (c): c is CstNode => isCstNode(c) && c.kind === kind
  );
}

/** Get the first direct child CST node of a specific kind. */
function childNode(node: CstNode, kind: CstKind): CstNode | undefined {
  return node.children.find(
    (c): c is CstNode => isCstNode(c) && c.kind === kind
  );
}

/** Get the first token of a specific kind from a CST node. */
function findToken(node: CstNode, kind: TokenKind): Token | undefined {
  return node.children.find(
    (c): c is Token => isToken(c) && c.kind === kind
  );
}

/** Get all tokens of a specific kind. */
function findTokens(node: CstNode, kind: TokenKind): Token[] {
  return node.children.filter(
    (c): c is Token => isToken(c) && c.kind === kind
  );
}

/** Check if a token of a specific kind exists. */
function hasToken(node: CstNode, kind: TokenKind): boolean {
  return findToken(node, kind) !== undefined;
}

/** Extract all prose content from a ProseContent node as a string array (one per line). */
function extractProseLines(node: CstNode): string[] {
  const lines: string[] = [];
  let current = '';
  for (const child of node.children) {
    if (isToken(child)) {
      if (child.kind === TokenKind.NEWLINE) {
        if (current.trim()) lines.push(current.trim());
        current = '';
      } else if (child.kind === TokenKind.PROSE) {
        if (current.trim()) lines.push(current.trim());
        current = '';
        lines.push(child.text.trim());
      } else if (!TRIVIA_KINDS.has(child.kind)) {
        current += (current ? ' ' : '') + child.text;
      }
    } else if (isCstNode(child) && child.kind === CstKind.ProseContent) {
      lines.push(...extractProseLines(child));
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

/** Extract prose from a prose keyword block (e.g. DoBlock, MustBlock).
 *  Collects all ProseContent children into string lines. */
function extractBlockProse(node: CstNode): string[] {
  const lines: string[] = [];
  for (const child of node.children) {
    if (isCstNode(child) && child.kind === CstKind.ProseContent) {
      lines.push(...extractProseLines(child));
    } else if (isToken(child) && child.kind === TokenKind.PROSE) {
      lines.push(child.text.trim());
    }
  }
  return lines;
}

/** Join all non-trivia tokens in a node as a single string. */
function collectText(node: CstNode): string {
  return tokens(node).map(t => t.text).join(' ').trim();
}

/** Recursively join all non-trivia tokens in a node and its children. */
function collectTextDeep(node: CstNode): string {
  const parts: string[] = [];
  for (const child of node.children) {
    if (isToken(child) && !TRIVIA_KINDS.has(child.kind)) {
      parts.push(child.text);
    } else if (isCstNode(child)) {
      const text = collectTextDeep(child);
      if (text) parts.push(text);
    }
  }
  return parts.join(' ').trim();
}

/** Get context line text from a ContextLine CST node.
 *  Strips the leading > character. */
function extractContextText(node: CstNode): string {
  const toks = tokens(node);
  if (toks.length === 1 && toks[0]!.kind === TokenKind.PROSE) {
    const text = toks[0]!.text.trim();
    return text.startsWith('>') ? text.slice(1).trim() : text;
  }
  // GT + ProseContent form
  const proseNode = childNode(node, CstKind.ProseContent);
  if (proseNode) {
    return collectText(proseNode);
  }
  // Fallback: join non-GT tokens
  return toks.filter(t => t.kind !== TokenKind.GT).map(t => t.text).join(' ').trim();
}

// ─── Program ──────────────────────────────────────────────────

function transformProgram(cst: CstNode): GistProgram {
  const program: GistProgram = {
    span: cst.span,
    types: [],
    traits: [],
    models: [],
    enums: [],
    errors: [],
    constants: [],
    stateMachines: [],
    modules: [],
    tests: [],
    kitConstructs: [],
    compositions: [],
    onHandlers: [],
  };

  for (const child of cst.children) {
    if (!isCstNode(child)) continue;
    switch (child.kind) {
      case CstKind.ProjectDecl:
        program.project = transformProjectDecl(child);
        break;
      case CstKind.TypeDecl:
        program.types.push(transformTypeDecl(child));
        break;
      case CstKind.TraitDecl:
        program.traits.push(transformTraitDecl(child));
        break;
      case CstKind.ModelDecl:
        program.models.push(transformModelDecl(child));
        break;
      case CstKind.EnumDecl:
        program.enums.push(transformEnumDecl(child));
        break;
      case CstKind.ErrorDecl:
        program.errors.push(transformErrorDecl(child));
        break;
      case CstKind.ConstDecl:
        program.constants.push(transformConstDecl(child));
        break;
      case CstKind.StateDecl:
        program.stateMachines.push(transformStateDecl(child));
        break;
      case CstKind.ModuleDecl:
        program.modules.push(transformModuleDecl(child));
        break;
      case CstKind.TestDecl:
        program.tests.push(transformTestDecl(child));
        break;
      case CstKind.KitConstruct:
        program.kitConstructs.push(transformKitConstruct(child));
        break;
      case CstKind.UseDecl:
        program.compositions.push(transformUseDecl(child));
        break;
      case CstKind.ExtendDecl:
        program.compositions.push(transformExtendDecl(child));
        break;
      case CstKind.RefineDecl:
        program.compositions.push(transformRefineDecl(child));
        break;
      case CstKind.OnHandler:
        program.onHandlers.push(transformOnHandler(child));
        break;
    }
  }

  return program;
}

// ─── Project ──────────────────────────────────────────────────

function transformProjectDecl(node: CstNode): ProjectHeader {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);

  const header: ProjectHeader = {
    span: node.span,
    name: nameToken?.text ?? '',
    context: [],
  };

  for (const child of node.children) {
    if (!isCstNode(child)) continue;
    switch (child.kind) {
      case CstKind.ContextLine:
        header.context.push(extractContextText(child));
        break;
      case CstKind.KitLine:
        header.kit = extractKitNames(child);
        break;
      case CstKind.StackLine:
        header.stack = extractStackValue(child);
        break;
      case CstKind.StyleBlock:
        header.style = extractBlockProse(child);
        break;
      case CstKind.RulesBlock:
        header.rules = transformRulesBlock(child);
        break;
      case CstKind.AlwaysBlock:
        header.always = extractAlwaysLines(child);
        break;
      case CstKind.BeforeBlock:
        header.before = extractBlockProse(child);
        break;
      case CstKind.AfterBlock:
        header.after = extractBlockProse(child);
        break;
    }
  }

  return header;
}

function extractKitNames(node: CstNode): string[] {
  return tokens(node)
    .filter(t => t.kind === TokenKind.IDENTIFIER || t.kind === TokenKind.STRING_LITERAL || t.kind === TokenKind.KIT_KEYWORD)
    .map(t => t.kind === TokenKind.STRING_LITERAL ? t.text.slice(1, -1) : t.text);
}

function extractStackValue(node: CstNode): string {
  const toks = tokens(node).filter(t =>
    t.kind !== TokenKind.KW_STACK && t.kind !== TokenKind.COLON
  );
  return toks.map(t => t.text).join('');
}

function transformRulesBlock(node: CstNode): RulesEntry[] {
  return childNodes(node, CstKind.RulesEntry).map(entry => {
    const nameToken = findToken(entry, TokenKind.IDENTIFIER);
    const prose = childNode(entry, CstKind.ProseContent);
    const inlineObj = childNode(entry, CstKind.InlineObject);
    return {
      span: entry.span,
      name: nameToken?.text ?? '',
      body: prose ? collectText(prose) : inlineObj ? collectText(inlineObj) : '',
    };
  });
}

function extractAlwaysLines(node: CstNode): string[] {
  const lines: string[] = [];
  for (const child of node.children) {
    if (isCstNode(child) && child.kind === CstKind.AlwaysLine) {
      const text = collectTextDeep(child);
      if (text) lines.push(text);
    } else if (isCstNode(child) && child.kind === CstKind.ProseContent) {
      lines.push(...extractProseLines(child));
    }
  }
  return lines;
}

// ─── Types ────────────────────────────────────────────────────

function transformTypeDecl(node: CstNode): TypeDeclaration {
  const nameToken = findToken(node, TokenKind.TYPE_NAME);
  const typeRefs = childNodes(node, CstKind.TypeRef);
  const caps = childNode(node, CstKind.Capabilities);

  const decl: TypeDeclaration = {
    span: node.span,
    name: nameToken?.text ?? '',
  };

  if (typeRefs.length > 0) {
    decl.baseType = transformTypeRef(typeRefs[0]!);
  }

  if (caps) {
    decl.capabilities = childNodes(caps, CstKind.CapabilityEntry).map(transformCapabilityEntry);
  }

  return decl;
}

function transformCapabilityEntry(node: CstNode): CapabilityEntry {
  const toks = tokens(node);
  const name = toks[0]?.text ?? '';
  const prose = childNode(node, CstKind.ProseContent);
  return {
    span: node.span,
    name,
    value: prose ? collectText(prose) : '',
  };
}

// ─── Traits ───────────────────────────────────────────────────

function extractSpreadRef(node: CstNode): SpreadRef {
  // Walk non-trivia tokens looking for [IDENTIFIER DOT] TYPE_NAME.
  // The SPREAD token is always first; we skip it.
  const toks = tokens(node);
  let alias: string | undefined;
  let aliasSpan: TextSpan | undefined;
  let name = '';
  let nameSpan: TextSpan = node.span;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind === TokenKind.IDENTIFIER && toks[i + 1]?.kind === TokenKind.DOT &&
        toks[i + 2]?.kind === TokenKind.TYPE_NAME) {
      alias = t.text;
      aliasSpan = t.span;
      name = toks[i + 2]!.text;
      nameSpan = toks[i + 2]!.span;
      break;
    }
    if (t.kind === TokenKind.TYPE_NAME) {
      name = t.text;
      nameSpan = t.span;
      break;
    }
  }
  return { span: node.span, alias, name, aliasSpan, nameSpan };
}

function transformTraitDecl(node: CstNode): TraitDeclaration {
  const nameToken = findToken(node, TokenKind.TYPE_NAME);
  const fields = childNodes(node, CstKind.FieldDecl).map(transformFieldDecl);
  const spreads = childNodes(node, CstKind.SpreadField).map(extractSpreadRef);
  const alwaysBlock = childNode(node, CstKind.AlwaysBlock);

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    fields,
    spreads,
    always: alwaysBlock ? extractAlwaysLines(alwaysBlock) : undefined,
  };
}

// ─── Models ───────────────────────────────────────────────────

function transformModelDecl(node: CstNode): ModelDeclaration {
  const nameToken = findToken(node, TokenKind.TYPE_NAME);
  const ephemeral = hasToken(node, TokenKind.KW_EPHEMERAL);
  const immutable = hasToken(node, TokenKind.KW_IMMUTABLE);
  const fields = childNodes(node, CstKind.FieldDecl).map(transformFieldDecl);
  const spreads = childNodes(node, CstKind.SpreadField).map(extractSpreadRef);
  const ttlNode = childNode(node, CstKind.TtlDecl);
  const retainNode = childNode(node, CstKind.RetainDecl);
  const alwaysBlock = childNode(node, CstKind.AlwaysBlock);

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    modifier: ephemeral ? 'ephemeral' : immutable ? 'immutable' : undefined,
    fields,
    spreads,
    ttl: ttlNode ? extractTtlValue(ttlNode) : undefined,
    retain: retainNode ? extractRetainValue(retainNode) : undefined,
    always: alwaysBlock ? extractAlwaysLines(alwaysBlock) : undefined,
  };
}

function extractTtlValue(node: CstNode): string {
  const dur = findToken(node, TokenKind.DURATION);
  return dur?.text ?? '';
}

function extractRetainValue(node: CstNode): string {
  const toks = tokens(node).filter(t =>
    t.kind !== TokenKind.KW_RETAIN && t.kind !== TokenKind.COLON
  );
  return toks.map(t => t.text).join(' ').trim();
}

function transformFieldDecl(node: CstNode): FieldDeclaration {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const optional = hasToken(node, TokenKind.QUESTION);
  const typeRefNode = childNode(node, CstKind.TypeRef);
  const literalNode = childNode(node, CstKind.Literal);

  const modifiers: string[] = [];
  for (const child of node.children) {
    if (isToken(child) && (
      child.kind === TokenKind.KW_GENERATED ||
      child.kind === TokenKind.KW_UNIQUE ||
      child.kind === TokenKind.KW_SECRET ||
      child.kind === TokenKind.KW_COMPUTED
    )) {
      modifiers.push(child.text);
    }
    // Also pick up modifier identifiers like "cuid" after comma
    if (isToken(child) && child.kind === TokenKind.IDENTIFIER && child !== nameToken &&
        node.children.indexOf(child) > (nameToken ? node.children.indexOf(nameToken) : 0)) {
      // Check if this identifier follows a comma (it's a modifier)
      const idx = node.children.indexOf(child);
      for (let i = idx - 1; i >= 0; i--) {
        const prev = node.children[i]!;
        if (isToken(prev) && prev.kind === TokenKind.COMMA) {
          modifiers.push(child.text);
          break;
        }
        if (isToken(prev) && !TRIVIA_KINDS.has(prev.kind)) break;
      }
    }
  }

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    type: typeRefNode ? transformTypeRef(typeRefNode) : undefined,
    optional,
    modifiers,
    defaultValue: literalNode ? collectText(literalNode) : undefined,
  };
}

// ─── Enums ────────────────────────────────────────────────────

function transformEnumDecl(node: CstNode): EnumDeclaration {
  const nameToken = findToken(node, TokenKind.TYPE_NAME);
  const values = tokens(node)
    .filter(t => t.kind === TokenKind.IDENTIFIER)
    .map(t => t.text);

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    values,
  };
}

// ─── Errors ───────────────────────────────────────────────────

function transformErrorDecl(node: CstNode): ErrorDeclaration {
  const nameToken = findToken(node, TokenKind.TYPE_NAME);
  const fields = childNodes(node, CstKind.ErrorField).map(transformErrorField);

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    fields,
  };
}

function transformErrorField(node: CstNode): ErrorFieldNode {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const typeRefNode = childNode(node, CstKind.TypeRef);

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    type: typeRefNode ? transformTypeRef(typeRefNode) : undefined,
  };
}

// ─── Constants ────────────────────────────────────────────────

function transformConstDecl(node: CstNode): ConstantDeclaration {
  const nameToken = findToken(node, TokenKind.UPPER_IDENTIFIER);
  const literalNode = childNode(node, CstKind.Literal);

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    value: literalNode ? collectText(literalNode) : '',
  };
}

// ─── State Machines ───────────────────────────────────────────

function transformStateDecl(node: CstNode): StateMachineDeclaration {
  const toks = tokens(node);
  const typeNames = toks.filter(t => t.kind === TokenKind.TYPE_NAME);
  const machineName = typeNames[0]?.text ?? '';
  const modelName = typeNames[1]?.text ?? '';
  const fieldIdent = toks.find(t =>
    t.kind === TokenKind.IDENTIFIER && t !== toks[0]
  );

  // Find the identifier that follows the DOT
  let fieldName = '';
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!;
    if (isToken(child) && child.kind === TokenKind.DOT) {
      // Next non-trivia child should be the field name
      for (let j = i + 1; j < node.children.length; j++) {
        const next = node.children[j]!;
        if (isToken(next) && !TRIVIA_KINDS.has(next.kind)) {
          if (next.kind === TokenKind.IDENTIFIER) fieldName = next.text;
          break;
        }
      }
      break;
    }
  }

  const transitions = childNodes(node, CstKind.TransitionLine).map(transformTransitionLine);
  const hooks = childNodes(node, CstKind.StateHook).map(transformStateHook);

  return {
    span: node.span,
    name: machineName,
    forModel: modelName || undefined,
    forField: fieldName || undefined,
    transitions,
    hooks,
  };
}

function transformTransitionLine(node: CstNode): TransitionNode {
  const identifiers = tokens(node).filter(t => t.kind === TokenKind.IDENTIFIER);
  return {
    span: node.span,
    from: identifiers[0]?.text ?? '',
    to: identifiers[identifiers.length - 1]?.text ?? '',
  };
}

function transformStateHook(node: CstNode): StateHookNode {
  const toks = tokens(node);
  let event = '';
  let state = '';

  // on enter state_name or on event while state_name
  const hasEnter = hasToken(node, TokenKind.KW_ENTER);
  if (hasEnter) {
    event = 'enter';
    const identifiers = toks.filter(t => t.kind === TokenKind.IDENTIFIER);
    state = identifiers[0]?.text ?? '';
  } else {
    const identifiers = toks.filter(t => t.kind === TokenKind.IDENTIFIER);
    event = identifiers[0]?.text ?? '';
    state = identifiers[1]?.text ?? '';
  }

  const proseNode = childNode(node, CstKind.ProseContent);
  return {
    span: node.span,
    event,
    state,
    body: proseNode ? extractProseLines(proseNode) : [],
  };
}

// ─── Modules ──────────────────────────────────────────────────

function transformModuleDecl(node: CstNode): ModuleDeclaration {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);

  const context: string[] = [];
  const needs: string[] = [];
  const intents: IntentDeclaration[] = [];
  const fns: FnDeclaration[] = [];
  const flows: FlowDeclaration[] = [];
  const onHandlers: OnHandlerNode[] = [];
  let before: string[] | undefined;
  let after: string[] | undefined;

  for (const child of node.children) {
    if (!isCstNode(child)) continue;
    switch (child.kind) {
      case CstKind.ContextLine:
        context.push(extractContextText(child));
        break;
      case CstKind.NeedsLine:
        needs.push(...extractNeedsNames(child));
        break;
      case CstKind.BeforeBlock:
        before = extractBlockProse(child);
        break;
      case CstKind.AfterBlock:
        after = extractBlockProse(child);
        break;
      case CstKind.IntentDecl:
        intents.push(transformIntentDecl(child));
        break;
      case CstKind.FnDecl:
        fns.push(transformFnDecl(child));
        break;
      case CstKind.FlowDecl:
        flows.push(transformFlowDecl(child));
        break;
      case CstKind.OnHandler:
        onHandlers.push(transformOnHandler(child));
        break;
    }
  }

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    context,
    needs,
    before,
    after,
    intents,
    fns,
    flows,
    onHandlers,
  };
}

function extractNeedsNames(node: CstNode): string[] {
  return tokens(node)
    .filter(t => t.kind === TokenKind.IDENTIFIER || t.kind === TokenKind.TYPE_NAME)
    .map(t => t.text);
}

// ─── Intents ──────────────────────────────────────────────────

function transformIntentDecl(node: CstNode): IntentDeclaration {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const paramList = childNode(node, CstKind.ParamList);
  const typeRefNodes = childNodes(node, CstKind.TypeRef);

  const intent: IntentDeclaration = {
    span: node.span,
    name: nameToken?.text ?? '',
    params: paramList ? transformParamList(paramList) : [],
    isPublic: false,
    isAsync: false,
    trace: false,
  };

  // Return type: first TypeRef that is a direct child (after ARROW)
  if (typeRefNodes.length > 0) {
    // Check it's preceded by ARROW
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      if (isToken(child) && child.kind === TokenKind.ARROW) {
        // Next CstNode should be the return type
        for (let j = i + 1; j < node.children.length; j++) {
          const next = node.children[j]!;
          if (isCstNode(next) && next.kind === CstKind.TypeRef) {
            intent.returnType = transformTypeRef(next);
            break;
          }
          if (isCstNode(next) && next.kind !== CstKind.TypeRef) break;
        }
        break;
      }
    }
  }

  // Extract metadata and behavior blocks
  for (const child of node.children) {
    if (!isCstNode(child)) continue;
    switch (child.kind) {
      case CstKind.MetadataLine:
        applyMetadataToIntent(child, intent);
        break;
      case CstKind.DoBlock:
        intent.doBlock = extractBlockProse(child);
        break;
      case CstKind.CodeBlock:
        intent.codeBlock = extractBlockProse(child);
        break;
      case CstKind.MustBlock:
        intent.must = extractBlockProse(child);
        break;
      case CstKind.EnsureBlock:
        intent.ensure = extractBlockProse(child);
        break;
      case CstKind.EgBlock:
        intent.eg = extractBlockProse(child);
        break;
      case CstKind.FailsBlock:
        intent.fails = extractBlockProse(child);
        break;
    }
  }

  return intent;
}

function applyMetadataToIntent(node: CstNode, intent: IntentDeclaration): void {
  const toks = tokens(node);
  if (toks.length === 0) return;

  const keyword = toks[0]!;
  const valueTokens = toks.slice(1).filter(t => t.kind !== TokenKind.COLON && t.kind !== TokenKind.COMMA);

  switch (keyword.kind) {
    case TokenKind.KW_ROUTE: {
      const method = valueTokens.find(t =>
        t.kind === TokenKind.KW_GET || t.kind === TokenKind.KW_POST ||
        t.kind === TokenKind.KW_PUT || t.kind === TokenKind.KW_PATCH ||
        t.kind === TokenKind.KW_DELETE
      );
      const path = valueTokens.find(t => t.kind === TokenKind.PATH);
      if (method && path) {
        intent.route = {
          span: node.span,
          method: method.text,
          path: path.text,
        };
      }
      break;
    }
    case TokenKind.KW_SAVES:
      intent.saves = valueTokens.map(t => t.text);
      break;
    case TokenKind.KW_EMITS:
      intent.emits = valueTokens.map(t => t.text);
      break;
    case TokenKind.KW_USES:
      intent.uses = valueTokens.map(t => t.text);
      break;
    case TokenKind.KW_NEEDS:
      intent.needs = valueTokens.map(t => t.text);
      break;
    case TokenKind.KW_GUARD: {
      const proseLines = extractBlockProse(node);
      intent.guard = proseLines;
      break;
    }
    case TokenKind.KW_SOCKET:
      intent.socket = valueTokens.map(t => t.text).join(' ');
      break;
    case TokenKind.KW_SCHEDULE:
      intent.schedule = valueTokens.map(t => t.text).join(' ');
      break;
    case TokenKind.KW_PUBLIC:
      intent.isPublic = true;
      break;
    case TokenKind.KW_ASYNC:
      intent.isAsync = true;
      break;
    case TokenKind.KW_TRACE:
      intent.trace = true;
      break;
  }
}

function transformParamList(node: CstNode): ParamNode[] {
  return childNodes(node, CstKind.Param).map(transformParam);
}

function transformParam(node: CstNode): ParamNode {
  const nameToken = tokens(node).find(t =>
    t.kind === TokenKind.IDENTIFIER || t.kind === TokenKind.TYPE_NAME
  );
  const optional = hasToken(node, TokenKind.QUESTION);
  const typeRefNode = childNode(node, CstKind.TypeRef);
  const literalNode = childNode(node, CstKind.Literal);

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    type: typeRefNode ? transformTypeRef(typeRefNode) : undefined,
    optional,
    defaultValue: literalNode ? collectText(literalNode) : undefined,
  };
}

// ─── Functions ────────────────────────────────────────────────

function transformFnDecl(node: CstNode): FnDeclaration {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const paramList = childNode(node, CstKind.ParamList);

  const fn: FnDeclaration = {
    span: node.span,
    name: nameToken?.text ?? '',
    params: paramList ? transformParamList(paramList) : [],
  };

  // Return type
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!;
    if (isToken(child) && child.kind === TokenKind.ARROW) {
      for (let j = i + 1; j < node.children.length; j++) {
        const next = node.children[j]!;
        if (isCstNode(next) && next.kind === CstKind.TypeRef) {
          fn.returnType = transformTypeRef(next);
          break;
        }
        if (isCstNode(next) && next.kind !== CstKind.TypeRef) break;
      }
      break;
    }
  }

  // Behavior blocks
  for (const child of node.children) {
    if (!isCstNode(child)) continue;
    switch (child.kind) {
      case CstKind.DoBlock:
        fn.doBlock = extractBlockProse(child);
        break;
      case CstKind.CodeBlock:
        fn.codeBlock = extractBlockProse(child);
        break;
      case CstKind.MustBlock:
        fn.must = extractBlockProse(child);
        break;
      case CstKind.EnsureBlock:
        fn.ensure = extractBlockProse(child);
        break;
      case CstKind.EgBlock:
        fn.eg = extractBlockProse(child);
        break;
    }
  }

  return fn;
}

// ─── Flows ────────────────────────────────────────────────────

function transformFlowDecl(node: CstNode): FlowDeclaration {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const paramList = childNode(node, CstKind.ParamList);

  const flow: FlowDeclaration = {
    span: node.span,
    name: nameToken?.text ?? '',
    params: paramList ? transformParamList(paramList) : [],
    stages: [],
    metadata: [],
  };

  // Return type
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!;
    if (isToken(child) && child.kind === TokenKind.ARROW) {
      for (let j = i + 1; j < node.children.length; j++) {
        const next = node.children[j]!;
        if (isCstNode(next) && next.kind === CstKind.TypeRef) {
          flow.returnType = transformTypeRef(next);
          break;
        }
        if (isCstNode(next) && next.kind !== CstKind.TypeRef) break;
      }
      break;
    }
  }

  // Stages, metadata, must/ensure
  for (const child of node.children) {
    if (!isCstNode(child)) continue;
    switch (child.kind) {
      case CstKind.StageBlock:
        flow.stages.push(transformStageBlock(child));
        break;
      case CstKind.MustBlock:
        flow.must = extractBlockProse(child);
        break;
      case CstKind.EnsureBlock:
        flow.ensure = extractBlockProse(child);
        break;
      case CstKind.MetadataLine: {
        const meta = transformMetadataEntry(child);
        if (meta) flow.metadata.push(meta);
        break;
      }
    }
  }

  return flow;
}

function transformStageBlock(node: CstNode): StageNode {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const compensateNode = childNode(node, CstKind.CompensateBlock);

  // Collect body prose from ProseContent nodes
  const body: string[] = [];
  for (const child of node.children) {
    if (isCstNode(child) && child.kind === CstKind.ProseContent) {
      body.push(...extractProseLines(child));
    }
  }

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    body,
    compensate: compensateNode ? extractBlockProse(compensateNode) : undefined,
  };
}

function transformMetadataEntry(node: CstNode): MetadataEntry | null {
  const toks = tokens(node);
  if (toks.length === 0) return null;

  const key = toks[0]!.text;
  const valueTokens = toks.slice(1).filter(t =>
    t.kind !== TokenKind.COLON && t.kind !== TokenKind.COMMA
  );

  return {
    span: node.span,
    key,
    value: valueTokens.map(t => t.text).join(' ').trim(),
  };
}

// ─── Event Handlers ───────────────────────────────────────────

function transformOnHandler(node: CstNode): OnHandlerNode {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const body: string[] = [];

  for (const child of node.children) {
    if (isCstNode(child) && child.kind === CstKind.ProseContent) {
      body.push(...extractProseLines(child));
    }
  }

  return {
    span: node.span,
    event: nameToken?.text ?? '',
    body,
  };
}

// ─── Kit Constructs ───────────────────────────────────────────

function transformKitConstruct(node: CstNode): KitConstructNode {
  const keywordToken = findToken(node, TokenKind.KIT_KEYWORD);
  const nameToken = findToken(node, TokenKind.TYPE_NAME) ?? findToken(node, TokenKind.IDENTIFIER);

  // Collect inline content: tokens between name and body
  const inlineParts: string[] = [];
  let pastName = false;
  for (const child of node.children) {
    if (!isToken(child)) continue;
    if (child === keywordToken || child === nameToken) {
      if (child === nameToken) pastName = true;
      continue;
    }
    if (TRIVIA_KINDS.has(child.kind)) continue;
    if (child.kind === TokenKind.OPEN_BRACE || child.kind === TokenKind.CLOSE_BRACE) continue;
    if (pastName || (!nameToken && child !== keywordToken)) {
      inlineParts.push(child.text);
    }
  }

  const children: KitConstructChild[] = [];
  for (const child of node.children) {
    if (!isCstNode(child)) continue;
    switch (child.kind) {
      case CstKind.KitConstruct:
        children.push(transformKitConstruct(child));
        break;
      case CstKind.KitBlock:
        children.push(transformKitBlock(child));
        break;
      case CstKind.IntentDecl:
        children.push(transformIntentDecl(child));
        break;
      case CstKind.FnDecl:
        children.push(transformFnDecl(child));
        break;
      case CstKind.FlowDecl:
        children.push(transformFlowDecl(child));
        break;
      case CstKind.OnHandler:
        children.push(transformOnHandler(child));
        break;
      case CstKind.FieldDecl:
        children.push(transformFieldDecl(child));
        break;
    }
  }

  return {
    span: node.span,
    keyword: keywordToken?.text ?? '',
    name: nameToken?.text,
    inlineContent: inlineParts.join(' ').trim(),
    children,
  };
}

function transformKitBlock(node: CstNode): KitBlockNode {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const prose = childNode(node, CstKind.ProseContent);
  const inlineList = childNode(node, CstKind.InlineList);
  const inlineObj = childNode(node, CstKind.InlineObject);

  let value = '';
  if (prose) {
    value = collectText(prose);
  } else if (inlineList) {
    value = collectText(inlineList);
  } else if (inlineObj) {
    value = collectText(inlineObj);
  }

  return {
    span: node.span,
    key: nameToken?.text ?? '',
    value,
  };
}

// ─── Tests ────────────────────────────────────────────────────

function transformTestDecl(node: CstNode): TestDeclaration {
  const nameToken = findToken(node, TokenKind.IDENTIFIER);
  const steps: TestStep[] = [];

  for (const child of node.children) {
    if (!isCstNode(child)) continue;
    const step = transformTestStep(child);
    if (step) steps.push(step);
  }

  return {
    span: node.span,
    name: nameToken?.text ?? '',
    steps,
  };
}

function transformTestStep(node: CstNode): TestStep | null {
  switch (node.kind) {
    case CstKind.GivenBlock:
      return transformGivenStep(node);
    case CstKind.CallStep:
      return transformCallStep(node);
    case CstKind.TriggerStep:
      return transformTriggerStep(node);
    case CstKind.ThenStep:
      return transformThenStep(node);
    case CstKind.ExpectStep:
    case CstKind.ExpectAfterStep:
    case CstKind.ExpectClientStep:
      return transformExpectStep(node);
    case CstKind.MustFailStep:
      return transformMustFailStep(node);
    case CstKind.AsContextStep:
      return transformAsContextStep(node);
    default:
      return null;
  }
}

function transformGivenStep(node: CstNode): GivenStep {
  return {
    span: node.span,
    kind: 'given',
    content: extractBlockProse(node).join('\n'),
  };
}

function transformCallStep(node: CstNode): CallStep {
  const proseNode = childNode(node, CstKind.ProseContent);
  return {
    span: node.span,
    kind: 'call',
    content: proseNode ? collectText(proseNode) : '',
  };
}

function transformTriggerStep(node: CstNode): TriggerStep {
  const proseNode = childNode(node, CstKind.ProseContent);
  return {
    span: node.span,
    kind: 'trigger',
    content: proseNode ? collectText(proseNode) : '',
  };
}

function transformThenStep(node: CstNode): ThenStep {
  const callNode = childNode(node, CstKind.CallStep);
  const proseNode = childNode(node, CstKind.ProseContent);

  if (callNode) {
    return {
      span: node.span,
      kind: 'then',
      step: transformCallStep(callNode),
    };
  }

  // Fallback: treat as call with the prose content
  return {
    span: node.span,
    kind: 'then',
    step: {
      span: node.span,
      kind: 'call',
      content: proseNode ? collectText(proseNode) : '',
    },
  };
}

function transformExpectStep(node: CstNode): ExpectStep {
  return {
    span: node.span,
    kind: 'expect',
    content: extractBlockProse(node).join('\n'),
  };
}

function transformMustFailStep(node: CstNode): MustFailStep {
  return {
    span: node.span,
    kind: 'must_fail',
    content: extractBlockProse(node).join('\n'),
  };
}

function transformAsContextStep(node: CstNode): AsContextStep {
  const toks = tokens(node);
  const identifiers = toks.filter(t =>
    t.kind === TokenKind.IDENTIFIER || t.kind === TokenKind.TYPE_NAME
  );

  return {
    span: node.span,
    kind: 'as_context',
    role: identifiers[0]?.text ?? '',
    scope: identifiers[1]?.text ?? '',
  };
}

// ─── Type References ──────────────────────────────────────────

function transformTypeRef(node: CstNode): TypeRef {
  const toks = tokens(node);
  const optional = hasToken(node, TokenKind.QUESTION);
  const array = hasToken(node, TokenKind.OPEN_BRACKET);
  const innerTypeRefs = childNodes(node, CstKind.TypeRef);
  const hasPipe = hasToken(node, TokenKind.PIPE);

  // The parser wraps base types in nested TypeRef nodes:
  //   TypeRef (outer, from parseTypeRef) -> TypeRef (inner, from parseBaseType)
  // When the outer has no meaningful direct tokens and a single inner TypeRef
  // (no union), delegate to the inner node for base type extraction.
  let base: BaseTypeRef;
  if (!hasPipe && innerTypeRefs.length === 1 && toks.length === 0) {
    // Simple non-union type: delegate fully to the inner node
    const inner = transformTypeRef(innerTypeRefs[0]!);
    return {
      span: node.span,
      base: inner.base,
      optional: optional || inner.optional,
      array: array || inner.array,
      union: inner.union,
    };
  } else if (!hasPipe && innerTypeRefs.length === 1) {
    // Has direct tokens (like ? or []) plus one inner type ref
    base = extractBaseType(innerTypeRefs[0]!, tokens(innerTypeRefs[0]!));
  } else if (hasPipe && innerTypeRefs.length > 0) {
    // Union type: first inner is the base, rest are union members
    const firstInner = innerTypeRefs[0]!;
    base = extractBaseType(firstInner, tokens(firstInner));
  } else {
    // Direct tokens define the type (terminal node)
    base = extractBaseType(node, toks);
  }

  const typeRef: TypeRef = {
    span: node.span,
    base,
    optional,
    array,
  };

  if (hasPipe && innerTypeRefs.length > 1) {
    typeRef.union = innerTypeRefs.slice(1).map(transformTypeRef);
  }

  return typeRef;
}

function extractBaseType(node: CstNode, toks: Token[]): BaseTypeRef {
  const firstMeaningful = toks.find(t =>
    t.kind !== TokenKind.QUESTION && t.kind !== TokenKind.OPEN_BRACKET &&
    t.kind !== TokenKind.CLOSE_BRACKET && t.kind !== TokenKind.PIPE &&
    t.kind !== TokenKind.COMMA && t.kind !== TokenKind.GT &&
    t.kind !== TokenKind.INT_LITERAL && t.kind !== TokenKind.DOT
  );

  if (!firstMeaningful) {
    // Check for inline struct with no direct tokens
    const inlineObj = childNode(node, CstKind.InlineObject);
    if (inlineObj) {
      const fields = childNodes(inlineObj, CstKind.FieldDecl).map(transformFieldDecl);
      return { kind: 'inline_struct', fields, span: node.span };
    }
    return { kind: 'named', name: '', span: node.span };
  }

  // Primitives
  if (PRIMITIVE_TOKENS.has(firstMeaningful.kind)) {
    return { kind: 'primitive', name: firstMeaningful.text, span: node.span };
  }

  // Arrow -> Model reference
  if (firstMeaningful.kind === TokenKind.ARROW) {
    const target = toks.find(t => t.kind === TokenKind.TYPE_NAME);
    return { kind: 'model_ref', target: target?.text ?? '', span: node.span };
  }

  // error type
  if (firstMeaningful.kind === TokenKind.KW_ERROR) {
    return { kind: 'error', span: node.span };
  }

  // result<T>
  if (firstMeaningful.kind === TokenKind.KW_RESULT) {
    const innerTypeRef = childNodes(node, CstKind.TypeRef);
    return {
      kind: 'result',
      inner: innerTypeRef.length > 0 ? transformTypeRef(innerTypeRef[0]!) : undefined,
      span: node.span,
    };
  }

  // map<K, V>
  if (firstMeaningful.kind === TokenKind.KW_MAP) {
    const innerTypeRefs = childNodes(node, CstKind.TypeRef);
    return {
      kind: 'map',
      key: innerTypeRefs.length > 0 ? transformTypeRef(innerTypeRefs[0]!) : undefined,
      value: innerTypeRefs.length > 1 ? transformTypeRef(innerTypeRefs[1]!) : undefined,
      span: node.span,
    };
  }

  // Inline struct { ... }
  const inlineObj = childNode(node, CstKind.InlineObject);
  if (inlineObj) {
    const fields = childNodes(inlineObj, CstKind.FieldDecl).map(transformFieldDecl);
    return { kind: 'inline_struct', fields, span: node.span };
  }

  // Qualified type ref: IDENTIFIER DOT TYPE_NAME
  if (firstMeaningful.kind === TokenKind.IDENTIFIER) {
    const allToks = node.children.filter(
      (c): c is Token => isToken(c) && !TRIVIA_KINDS.has(c.kind)
    );
    const aliasIdx = allToks.indexOf(firstMeaningful);
    if (aliasIdx >= 0 &&
        allToks[aliasIdx + 1]?.kind === TokenKind.DOT &&
        allToks[aliasIdx + 2]?.kind === TokenKind.TYPE_NAME) {
      const alias = allToks[aliasIdx]!;
      const typeName = allToks[aliasIdx + 2]!;
      return {
        kind: 'qualified',
        alias: alias.text,
        name: typeName.text,
        aliasSpan: alias.span,
        nameSpan: typeName.span,
        span: node.span,
      };
    }
  }

  // Named type (PascalCase)
  if (firstMeaningful.kind === TokenKind.TYPE_NAME) {
    return { kind: 'named', name: firstMeaningful.text, span: node.span };
  }

  // Identifier as type name
  if (firstMeaningful.kind === TokenKind.IDENTIFIER) {
    return { kind: 'named', name: firstMeaningful.text, span: node.span };
  }

  return { kind: 'named', name: firstMeaningful.text, span: node.span };
}

// ─── Composition ──────────────────────────────────────────────

function transformUseDecl(node: CstNode): UseNode {
  const target = findToken(node, TokenKind.STRING_LITERAL);
  // Walk non-trivia tokens to find the identifier after `as` and
  // the exposing list after `exposing`.
  const toks = tokens(node);
  let alias: string | undefined;
  let exposing: ExposedName[] | undefined;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind === TokenKind.KW_AS) {
      const next = toks[i + 1];
      if (next?.kind === TokenKind.IDENTIFIER) {
        alias = next.text;
      }
    } else if (t.kind === TokenKind.KW_EXPOSING) {
      exposing = [];
      for (let j = i + 1; j < toks.length; j++) {
        const tj = toks[j]!;
        if (tj.kind === TokenKind.TYPE_NAME || tj.kind === TokenKind.IDENTIFIER) {
          exposing.push({ name: tj.text, span: tj.span });
        } else if (tj.kind === TokenKind.COMMA) {
          continue;
        } else {
          break;
        }
      }
      break;
    }
  }
  return {
    span: node.span,
    compositionKind: 'use',
    target: target ? target.text.slice(1, -1) : '',
    alias,
    exposing,
  };
}

function transformExtendDecl(node: CstNode): ExtendNode {
  const target = extractExtendTarget(node);
  const body = extractExtendBody(node);
  return { span: node.span, compositionKind: 'extend', target, body };
}

function transformRefineDecl(node: CstNode): RefineNode {
  const target = extractExtendTarget(node);
  const body = extractExtendBody(node);
  return { span: node.span, compositionKind: 'refine', target, body };
}

function extractExtendTarget(node: CstNode): string {
  // Walk non-trivia tokens: skip the leading KW_EXTEND/KW_REFINE, then collect
  // identifier tokens joined with DOT for qualified targets.
  const toks = tokens(node);
  const parts: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind === TokenKind.KW_EXTEND || t.kind === TokenKind.KW_REFINE) continue;
    if (t.kind === TokenKind.IDENTIFIER) {
      parts.push(t.text);
      const next = toks[i + 1];
      if (next?.kind === TokenKind.DOT) continue;
      break;
    }
    if (t.kind === TokenKind.DOT) continue;
    break;
  }
  return parts.join('.');
}

function extractExtendBody(node: CstNode): string[] {
  const prose = childNode(node, CstKind.ProseContent);
  return prose ? extractProseLines(prose) : [];
}
