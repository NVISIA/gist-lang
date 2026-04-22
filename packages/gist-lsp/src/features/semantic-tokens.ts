import {
  SemanticTokensBuilder,
  SemanticTokensLegend,
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { lex, TokenKind } from '@gist-lang/parser';
import type { KitRegistry } from '@gist-lang/workspace';

// ─── Legend ────────────────────────────────────────────────

export const TOKEN_TYPES = [
  'keyword',       // 0 - GIST keywords
  'type',          // 1 - Type names (PascalCase)
  'variable',      // 2 - Identifiers
  'string',        // 3 - String literals
  'number',        // 4 - Numeric literals
  'comment',       // 5 - Comments
  'operator',      // 6 - Operators and delimiters
  'parameter',     // 7 - Route parameters (:id)
  'macro',         // 8 - Kit keywords
  'decorator',     // 9 - Context lines (>)
  'function',      // 10 - Intent/fn/flow names
  'enumMember',    // 11 - Enum values
  'modifier',      // 12 - Field modifiers (generated, unique, etc.)
  'method',        // 13 - HTTP methods (GET, POST, etc.)
  'namespace',     // 14 - Import aliases (the `shared` in `shared.User`)
] as const;

export const TOKEN_MODIFIERS = [
  'declaration',   // 0
  'definition',    // 1
  'readonly',      // 2
] as const;

export const SEMANTIC_TOKENS_LEGEND: SemanticTokensLegend = {
  tokenTypes: [...TOKEN_TYPES],
  tokenModifiers: [...TOKEN_MODIFIERS],
};

// ─── Token type indices ─────────────────────────────────────

const TT_KEYWORD = 0;
const TT_TYPE = 1;
const TT_VARIABLE = 2;
const TT_STRING = 3;
const TT_NUMBER = 4;
const TT_COMMENT = 5;
const TT_OPERATOR = 6;
const TT_PARAMETER = 7;
const TT_MACRO = 8;
const TT_DECORATOR = 9;
const TT_FUNCTION = 10;
const TT_ENUM_MEMBER = 11;
const TT_MODIFIER = 12;
const TT_METHOD = 13;
const TT_NAMESPACE = 14;

// Keywords that introduce declarations (the next identifier is a function/intent name)
const DECL_KEYWORDS = new Set([
  TokenKind.KW_TO,
  TokenKind.KW_FN,
  TokenKind.KW_FLOW,
]);

// Modifier keywords
const MODIFIER_KEYWORDS = new Set([
  TokenKind.KW_GENERATED,
  TokenKind.KW_UNIQUE,
  TokenKind.KW_SECRET,
  TokenKind.KW_COMPUTED,
  TokenKind.KW_EPHEMERAL,
  TokenKind.KW_IMMUTABLE,
  TokenKind.KW_PUBLIC,
  TokenKind.KW_ASYNC,
  TokenKind.KW_TRACE,
]);

// HTTP method keywords
const HTTP_KEYWORDS = new Set([
  TokenKind.KW_GET,
  TokenKind.KW_POST,
  TokenKind.KW_PUT,
  TokenKind.KW_PATCH,
  TokenKind.KW_DELETE,
]);

/**
 * Compute semantic tokens for a document.
 * These supplement the TextMate grammar with dynamic highlighting
 * (especially kit keywords, which are unknown to the static grammar).
 */
export function computeSemanticTokens(
  document: TextDocument,
  kitRegistry: KitRegistry | null,
): ReturnType<SemanticTokensBuilder['build']> {
  const source = document.getText();
  const kitKeywords = kitRegistry?.getAllKeywords();
  const lexResult = lex(source, { kitKeywords: kitKeywords?.size ? kitKeywords : undefined });
  const tokens = lexResult.tokens;

  const builder = new SemanticTokensBuilder();
  let afterDeclKeyword = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Skip structural tokens
    if (tok.kind === TokenKind.INDENT || tok.kind === TokenKind.DEDENT ||
        tok.kind === TokenKind.NEWLINE || tok.kind === TokenKind.EOF) {
      afterDeclKeyword = false;
      continue;
    }

    const line = tok.span.start.line;
    const char = tok.span.start.column;
    const length = tok.text.length;

    // Kit keywords — highlight as macro
    if (tok.kind === TokenKind.KIT_KEYWORD) {
      builder.push(line, char, length, TT_MACRO, 0);
      afterDeclKeyword = false;
      continue;
    }

    // HTTP methods
    if (HTTP_KEYWORDS.has(tok.kind)) {
      builder.push(line, char, length, TT_METHOD, 0);
      afterDeclKeyword = false;
      continue;
    }

    // Modifier keywords
    if (MODIFIER_KEYWORDS.has(tok.kind)) {
      builder.push(line, char, length, TT_MODIFIER, 0);
      afterDeclKeyword = false;
      continue;
    }

    // Declaration keywords — mark next identifier as function
    if (DECL_KEYWORDS.has(tok.kind)) {
      builder.push(line, char, length, TT_KEYWORD, 0);
      afterDeclKeyword = true;
      continue;
    }

    // Identifier after declaration keyword = function name
    if (afterDeclKeyword && tok.kind === TokenKind.IDENTIFIER) {
      builder.push(line, char, length, TT_FUNCTION, 0b001); // declaration modifier
      afterDeclKeyword = false;
      continue;
    }

    afterDeclKeyword = false;

    // Regular keywords
    if (tok.kind.startsWith('KW_')) {
      builder.push(line, char, length, TT_KEYWORD, 0);
      continue;
    }

    // Type names
    if (tok.kind === TokenKind.TYPE_NAME) {
      builder.push(line, char, length, TT_TYPE, 0);
      continue;
    }

    // Identifiers — color as namespace when part of a qualified `alias.TypeName` ref.
    if (tok.kind === TokenKind.IDENTIFIER) {
      if (isAliasInQualifiedRef(tokens, i)) {
        builder.push(line, char, length, TT_NAMESPACE, 0);
      } else {
        builder.push(line, char, length, TT_VARIABLE, 0);
      }
      continue;
    }

    // String literals
    if (tok.kind === TokenKind.STRING_LITERAL) {
      builder.push(line, char, length, TT_STRING, 0);
      continue;
    }

    // Numeric literals
    if (tok.kind === TokenKind.INT_LITERAL || tok.kind === TokenKind.FLOAT_LITERAL ||
        tok.kind === TokenKind.DURATION) {
      builder.push(line, char, length, TT_NUMBER, 0);
      continue;
    }

    // Comments
    if (tok.kind === TokenKind.LINE_COMMENT || tok.kind === TokenKind.BLOCK_COMMENT) {
      builder.push(line, char, length, TT_COMMENT, 0);
      continue;
    }

    // Path tokens — highlight route parameters
    if (tok.kind === TokenKind.PATH) {
      // The whole path gets base highlighting; route params (:id) are special
      builder.push(line, char, length, TT_STRING, 0);
      continue;
    }

    // Context lines (> text)
    if (tok.kind === TokenKind.GT) {
      // The > marker
      builder.push(line, char, length, TT_DECORATOR, 0);
      continue;
    }

    // Prose tokens
    if (tok.kind === TokenKind.PROSE) {
      // Prose is left uncolored (handled by TextMate)
      continue;
    }
  }

  return builder.build();
}

/** Return true if tokens[i] is an IDENTIFIER followed by DOT TYPE_NAME. */
function isAliasInQualifiedRef(
  tokens: readonly { kind: TokenKind }[],
  i: number,
): boolean {
  const next = nextMeaningful(tokens, i + 1);
  if (next === -1 || tokens[next]!.kind !== TokenKind.DOT) return false;
  const after = nextMeaningful(tokens, next + 1);
  if (after === -1) return false;
  return tokens[after]!.kind === TokenKind.TYPE_NAME;
}

function nextMeaningful(tokens: readonly { kind: TokenKind }[], from: number): number {
  for (let j = from; j < tokens.length; j++) {
    const k = tokens[j]!.kind;
    if (
      k === TokenKind.INDENT ||
      k === TokenKind.DEDENT ||
      k === TokenKind.NEWLINE ||
      k === TokenKind.LINE_COMMENT ||
      k === TokenKind.BLOCK_COMMENT
    ) continue;
    return j;
  }
  return -1;
}
