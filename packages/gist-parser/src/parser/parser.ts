import type { TextSpan } from '../common/source-location.js';
import { emptySpan, mergeSpans } from '../common/source-location.js';
import type { Diagnostic } from '../common/diagnostics.js';
import { DiagnosticSeverity } from '../common/diagnostics.js';
import { TokenKind, type Token } from '../lexer/tokens.js';
import { CstKind, type CstNode, type CstChild } from './cst-nodes.js';

export interface ParseResult {
  cst: CstNode;
  diagnostics: Diagnostic[];
}

export function parse(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  const cst = parser.parseProgram();
  return { cst, diagnostics: parser.diagnostics };
}

// ─── Trivia tokens (skip when looking for meaningful tokens) ──

const TRIVIA = new Set([
  TokenKind.NEWLINE,
  TokenKind.LINE_COMMENT,
  TokenKind.BLOCK_COMMENT,
]);

// ─── Token sets for disambiguation ───────────────────────────

/** Keywords that start top-level declarations (after project header). */
const TOP_LEVEL_STARTERS = new Set([
  TokenKind.KW_TYPE,
  TokenKind.KW_TRAIT,
  TokenKind.KW_STATE,
  TokenKind.KW_MODULE,
  TokenKind.KW_TEST,
  TokenKind.KW_USE,
  TokenKind.KW_EXTEND,
  TokenKind.KW_REFINE,
  TokenKind.TYPE_NAME,       // Model or Enum
  TokenKind.UPPER_IDENTIFIER, // Constant
  TokenKind.KW_ON,           // Top-level event handler
  TokenKind.KIT_KEYWORD,     // Kit construct
]);

/** Keywords that start intents inside a module. */
const MODULE_MEMBER_STARTERS = new Set([
  TokenKind.KW_TO,
  TokenKind.KW_FN,
  TokenKind.KW_FLOW,
  TokenKind.KW_ON,
]);

// ─── Parser ──────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;
  diagnostics: Diagnostic[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ── Helpers ─────────────────────────────────────────────

  private current(): Token {
    return this.tokens[this.pos] ?? this.eof();
  }

  private eof(): Token {
    const last = this.tokens[this.tokens.length - 1];
    return last ?? { kind: TokenKind.EOF, text: '', span: emptySpan() };
  }

  /** Peek at the current meaningful (non-trivia) token without consuming. */
  private peek(): Token {
    let i = this.pos;
    while (i < this.tokens.length && TRIVIA.has(this.tokens[i]!.kind)) {
      i++;
    }
    return this.tokens[i] ?? this.eof();
  }

  /** Peek at the Nth meaningful token ahead (0 = current meaningful). */
  private peekAhead(n: number): Token {
    let i = this.pos;
    let count = 0;
    while (i < this.tokens.length) {
      if (!TRIVIA.has(this.tokens[i]!.kind)) {
        if (count === n) return this.tokens[i]!;
        count++;
      }
      i++;
    }
    return this.eof();
  }

  /** Consume and return the current token (including trivia). */
  private advance(): Token {
    const t = this.tokens[this.pos]!;
    this.pos++;
    return t;
  }

  /** Skip trivia tokens, collecting them into the children array. */
  private skipTrivia(children: CstChild[]): void {
    while (this.pos < this.tokens.length && TRIVIA.has(this.current().kind)) {
      children.push(this.advance());
    }
  }

  /** Expect a specific token kind. If found, consume and add to children. If not, emit error. */
  private expect(kind: TokenKind, children: CstChild[]): Token | null {
    this.skipTrivia(children);
    if (this.current().kind === kind) {
      const t = this.advance();
      children.push(t);
      return t;
    }
    this.error(`Expected ${kind}, got ${this.current().kind} ('${this.current().text}')`, this.current().span);
    return null;
  }

  /** Consume a token if it matches, adding to children. Returns whether it matched. */
  private eat(kind: TokenKind, children: CstChild[]): boolean {
    this.skipTrivia(children);
    if (this.current().kind === kind) {
      children.push(this.advance());
      return true;
    }
    return false;
  }

  /** Check if the current meaningful token matches without consuming. */
  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private checkAny(...kinds: TokenKind[]): boolean {
    const k = this.peek().kind;
    return kinds.includes(k);
  }

  private error(message: string, span: TextSpan): void {
    this.diagnostics.push({ severity: DiagnosticSeverity.Error, message, span });
  }

  private makeNode(kind: CstKind, children: CstChild[]): CstNode {
    const first = children[0];
    const last = children[children.length - 1];
    const start = first ? first.span.start : emptySpan().start;
    const end = last ? last.span.end : emptySpan().end;
    return { kind, children, span: { start, end }, errors: [] };
  }

  /** Skip tokens until we find a synchronization point. */
  private syncTo(syncTokens: Set<TokenKind>, children: CstChild[]): void {
    while (this.pos < this.tokens.length) {
      const t = this.current();
      if (t.kind === TokenKind.EOF) break;
      if (syncTokens.has(t.kind)) break;
      if (t.kind === TokenKind.DEDENT) break;
      children.push(this.advance());
    }
  }

  /** Consume all tokens until DEDENT (or EOF), collecting as children. */
  private skipBlock(children: CstChild[]): void {
    let depth = 0;
    while (this.pos < this.tokens.length) {
      const t = this.current();
      if (t.kind === TokenKind.EOF) break;
      if (t.kind === TokenKind.INDENT) depth++;
      if (t.kind === TokenKind.DEDENT) {
        if (depth === 0) break;
        depth--;
      }
      children.push(this.advance());
    }
  }

  /** Collect prose content: all tokens until DEDENT at the current level. */
  private collectProseBlock(children: CstChild[]): CstNode {
    const proseChildren: CstChild[] = [];
    this.skipBlock(proseChildren);
    return this.makeNode(CstKind.ProseContent, proseChildren);
  }

  /** Collect inline prose: remaining tokens on the current line (until NEWLINE).
   *  If the current token is INDENT, consumes the entire nested block to prevent infinite loops. */
  private collectInlineProse(children: CstChild[]): CstNode {
    const proseChildren: CstChild[] = [];
    // If we're sitting on INDENT, consume the nested block as prose
    if (this.pos < this.tokens.length && this.current().kind === TokenKind.INDENT) {
      proseChildren.push(this.advance()); // INDENT
      this.skipBlock(proseChildren);
      this.eat(TokenKind.DEDENT, proseChildren);
      return this.makeNode(CstKind.ProseContent, proseChildren);
    }
    while (this.pos < this.tokens.length) {
      const t = this.current();
      if (t.kind === TokenKind.NEWLINE || t.kind === TokenKind.EOF ||
          t.kind === TokenKind.DEDENT || t.kind === TokenKind.INDENT) break;
      proseChildren.push(this.advance());
    }
    return this.makeNode(CstKind.ProseContent, proseChildren);
  }

  // ── Program (Section 2) ─────────────────────────────────

  parseProgram(): CstNode {
    const children: CstChild[] = [];

    this.skipTrivia(children);

    // Parse project declaration
    if (this.check(TokenKind.KW_PROJECT)) {
      children.push(this.parseProjectDecl());
    }

    // Parse top-level declarations
    while (this.pos < this.tokens.length && this.current().kind !== TokenKind.EOF) {
      this.skipTrivia(children);
      if (this.current().kind === TokenKind.EOF) break;

      const token = this.peek();

      if (token.kind === TokenKind.KW_TYPE) {
        children.push(this.parseTypeDecl());
      } else if (token.kind === TokenKind.KW_TRAIT) {
        children.push(this.parseTraitDecl());
      } else if (token.kind === TokenKind.KW_STATE) {
        children.push(this.parseStateDecl());
      } else if (token.kind === TokenKind.KW_MODULE) {
        children.push(this.parseModuleDecl());
      } else if (token.kind === TokenKind.KW_TEST) {
        children.push(this.parseTestDecl());
      } else if (token.kind === TokenKind.KW_ON) {
        children.push(this.parseOnHandler());
      } else if (token.kind === TokenKind.KW_USE) {
        children.push(this.parseUseDecl());
      } else if (token.kind === TokenKind.KIT_KEYWORD) {
        children.push(this.parseKitConstruct());
      } else if (token.kind === TokenKind.TYPE_NAME) {
        // Could be Model, Enum, or Error declaration
        children.push(this.parseTypeNameDecl());
      } else if (token.kind === TokenKind.UPPER_IDENTIFIER) {
        children.push(this.parseConstDecl());
      } else if (token.kind === TokenKind.DEDENT) {
        children.push(this.advance());
      } else {
        // Unknown top-level token — skip it
        const errChildren: CstChild[] = [];
        errChildren.push(this.advance());
        this.syncTo(TOP_LEVEL_STARTERS, errChildren);
        children.push(this.makeNode(CstKind.ErrorNode, errChildren));
      }
    }

    this.skipTrivia(children);
    if (this.current().kind === TokenKind.EOF) {
      children.push(this.advance());
    }

    return this.makeNode(CstKind.Program, children);
  }

  // ── Project Declaration (Section 3) ─────────────────────

  private parseProjectDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_PROJECT, children);
    this.expect(TokenKind.IDENTIFIER, children);

    // Expect INDENT for project body
    if (!this.eat(TokenKind.INDENT, children)) {
      return this.makeNode(CstKind.ProjectDecl, children);
    }

    // Parse project header contents
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      const t = this.peek();
      if (t.kind === TokenKind.DEDENT || t.kind === TokenKind.EOF) break;

      if (t.kind === TokenKind.PROSE && t.text.startsWith('>')) {
        children.push(this.parseContextLine());
      } else if (t.kind === TokenKind.GT) {
        children.push(this.parseContextLine());
      } else if (t.kind === TokenKind.KW_KIT) {
        children.push(this.parseKitLine());
      } else if (t.kind === TokenKind.KW_STACK) {
        children.push(this.parseStackLine());
      } else if (t.kind === TokenKind.KW_STYLE) {
        children.push(this.parseProseKeywordBlock(CstKind.StyleBlock, TokenKind.KW_STYLE));
      } else if (t.kind === TokenKind.KW_RULES) {
        children.push(this.parseRulesBlock());
      } else if (t.kind === TokenKind.KW_ALWAYS) {
        children.push(this.parseAlwaysBlock());
      } else if (t.kind === TokenKind.KW_BEFORE) {
        children.push(this.parseProseKeywordBlock(CstKind.BeforeBlock, TokenKind.KW_BEFORE));
      } else if (t.kind === TokenKind.KW_AFTER) {
        children.push(this.parseProseKeywordBlock(CstKind.AfterBlock, TokenKind.KW_AFTER));
      } else {
        break; // End of project header
      }
    }

    this.eat(TokenKind.DEDENT, children);
    return this.makeNode(CstKind.ProjectDecl, children);
  }

  private parseContextLine(): CstNode {
    const children: CstChild[] = [];
    // > prose or PROSE starting with >
    if (this.peek().kind === TokenKind.PROSE) {
      children.push(this.advance());
    } else if (this.peek().kind === TokenKind.GT) {
      children.push(this.advance());
      // Collect rest of line as prose
      children.push(this.collectInlineProse(children));
    }
    return this.makeNode(CstKind.ContextLine, children);
  }

  private parseKitLine(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_KIT, children);
    this.expect(TokenKind.COLON, children);

    // kit references: identifier or string, comma-separated
    this.skipTrivia(children);
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      const t = this.peek();
      if (t.kind === TokenKind.IDENTIFIER || t.kind === TokenKind.STRING_LITERAL ||
          t.kind === TokenKind.KIT_KEYWORD) {
        children.push(this.advance());
      } else {
        break;
      }
      if (!this.eat(TokenKind.COMMA, children)) break;
    }

    return this.makeNode(CstKind.KitLine, children);
  }

  private parseStackLine(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_STACK, children);
    this.expect(TokenKind.COLON, children);
    this.skipTrivia(children);
    // stack value: usually a string or identifier (gist.yaml)
    if (this.peek().kind === TokenKind.STRING_LITERAL || this.peek().kind === TokenKind.IDENTIFIER) {
      children.push(this.advance());
    }
    // Could also have dotted name like gist.yaml
    while (this.eat(TokenKind.DOT, children)) {
      this.skipTrivia(children);
      if (this.peek().kind === TokenKind.IDENTIFIER) {
        children.push(this.advance());
      }
    }
    return this.makeNode(CstKind.StackLine, children);
  }

  private parseRulesBlock(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_RULES, children);
    // rules identifier:
    this.skipTrivia(children);
    if (this.peek().kind === TokenKind.IDENTIFIER) {
      children.push(this.advance());
    }
    this.expect(TokenKind.COLON, children);

    if (this.eat(TokenKind.INDENT, children)) {
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;
        children.push(this.parseRulesEntry());
      }
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.RulesBlock, children);
  }

  private parseRulesEntry(): CstNode {
    const children: CstChild[] = [];
    // identifier: InlineObject
    this.skipTrivia(children);
    if (this.peek().kind === TokenKind.IDENTIFIER) {
      children.push(this.advance());
    }
    this.expect(TokenKind.COLON, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.OPEN_BRACE)) {
      children.push(this.parseInlineObject());
    } else {
      children.push(this.collectInlineProse(children));
    }
    return this.makeNode(CstKind.RulesEntry, children);
  }

  private parseAlwaysBlock(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_ALWAYS, children);
    this.expect(TokenKind.COLON, children);

    if (this.eat(TokenKind.INDENT, children)) {
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;
        children.push(this.parseAlwaysLine());
      }
      this.eat(TokenKind.DEDENT, children);
    } else {
      // Inline always
      children.push(this.collectInlineProse(children));
    }

    return this.makeNode(CstKind.AlwaysBlock, children);
  }

  private parseAlwaysLine(): CstNode {
    const children: CstChild[] = [];
    // Optional: across identifier:
    if (this.check(TokenKind.KW_ACROSS)) {
      children.push(this.advance());
      this.skipTrivia(children);
      if (this.peek().kind === TokenKind.IDENTIFIER || this.peek().kind === TokenKind.TYPE_NAME) {
        children.push(this.advance());
      }
      this.eat(TokenKind.COLON, children);
    }
    // Collect prose to end of line
    children.push(this.collectInlineProse(children));
    return this.makeNode(CstKind.AlwaysLine, children);
  }

  /** Parse a keyword: INDENT { prose } DEDENT block (style:, before:, after:, etc.) */
  private parseProseKeywordBlock(nodeKind: CstKind, kwKind: TokenKind): CstNode {
    const children: CstChild[] = [];
    this.expect(kwKind, children);
    this.expect(TokenKind.COLON, children);

    if (this.eat(TokenKind.INDENT, children)) {
      children.push(this.collectProseBlock(children));
      this.eat(TokenKind.DEDENT, children);
    } else {
      children.push(this.collectInlineProse(children));
      // After inline prose, there may be an indented continuation block
      // e.g., eg: create("https://example.com", "Example")
      //          => { id: "clx...", ... }
      this.skipTrivia(children);
      if (this.eat(TokenKind.INDENT, children)) {
        children.push(this.collectProseBlock(children));
        this.eat(TokenKind.DEDENT, children);
      }
    }

    return this.makeNode(nodeKind, children);
  }

  // ── Type Name Declaration (Model, Enum, Error) ──────────

  /** Disambiguate: TypeName = { ... } (model) vs TypeName = a | b (enum) vs TypeName = error { ... } */
  private parseTypeNameDecl(): CstNode {
    // Look ahead past TYPE_NAME =
    const second = this.peekAhead(1); // should be =
    const third = this.peekAhead(2);  // what follows =

    if (second.kind !== TokenKind.EQUALS) {
      // Not a declaration — error recovery
      const children: CstChild[] = [this.advance()];
      return this.makeNode(CstKind.ErrorNode, children);
    }

    // Check what follows =
    if (third.kind === TokenKind.OPEN_BRACE) {
      return this.parseModelDecl();
    }
    if (third.kind === TokenKind.KW_EPHEMERAL || third.kind === TokenKind.KW_IMMUTABLE) {
      return this.parseModelDecl();
    }
    if (third.kind === TokenKind.KW_ERROR) {
      return this.parseErrorDecl();
    }
    // If followed by identifier | identifier, it's an enum
    if ((third.kind === TokenKind.IDENTIFIER || third.kind === TokenKind.TYPE_NAME) &&
        this.peekAhead(3).kind === TokenKind.PIPE) {
      return this.parseEnumDecl();
    }
    // Single identifier without pipe — could be a simple enum or a type alias
    if (third.kind === TokenKind.IDENTIFIER) {
      return this.parseEnumDecl();
    }

    // Default to model
    return this.parseModelDecl();
  }

  // ── Types (Section 4) ───────────────────────────────────

  private parseTypeDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_TYPE, children);
    this.expect(TokenKind.TYPE_NAME, children);
    this.expect(TokenKind.EQUALS, children);

    // TypeBody: primitive, tuple, or struct
    this.skipTrivia(children);
    if (this.check(TokenKind.OPEN_PAREN)) {
      // Tuple type
      children.push(this.advance());
      children.push(this.parseTypeRef());
      while (this.eat(TokenKind.COMMA, children)) {
        children.push(this.parseTypeRef());
      }
      this.expect(TokenKind.CLOSE_PAREN, children);
    } else if (this.check(TokenKind.OPEN_BRACE)) {
      // Struct type
      children.push(this.parseInlineFieldList());
    } else {
      // Branded primitive
      children.push(this.parseTypeRef());
    }

    // Optional capabilities block { ... }
    this.skipTrivia(children);
    if (this.check(TokenKind.OPEN_BRACE)) {
      children.push(this.parseCapabilities());
    }

    return this.makeNode(CstKind.TypeDecl, children);
  }

  private parseCapabilities(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.OPEN_BRACE, children);

    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.CLOSE_BRACE) || this.check(TokenKind.EOF)) break;
      children.push(this.parseCapabilityEntry());
    }

    this.expect(TokenKind.CLOSE_BRACE, children);
    return this.makeNode(CstKind.Capabilities, children);
  }

  private parseCapabilityEntry(): CstNode {
    const children: CstChild[] = [];
    // capName [: capValue { , capValue }]
    this.skipTrivia(children);
    children.push(this.advance()); // cap name identifier
    if (this.eat(TokenKind.COLON, children)) {
      // Collect values until newline or next cap entry
      children.push(this.collectInlineProse(children));
    }
    return this.makeNode(CstKind.CapabilityEntry, children);
  }

  // ── Traits (Section 5) ──────────────────────────────────

  private parseTraitDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_TRAIT, children);
    this.expect(TokenKind.TYPE_NAME, children);
    this.expect(TokenKind.OPEN_BRACE, children);

    // Inside braces, INDENT/DEDENT are suppressed by lexer. Parse fields until CLOSE_BRACE.
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.CLOSE_BRACE) || this.check(TokenKind.EOF)) break;

      if (this.check(TokenKind.KW_ALWAYS)) {
        children.push(this.parseAlwaysBlock());
      } else if (this.check(TokenKind.SPREAD)) {
        children.push(this.parseSpreadField());
      } else if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.parseFieldDecl());
      } else {
        children.push(this.advance()); // skip unknown
      }
    }

    this.expect(TokenKind.CLOSE_BRACE, children);
    return this.makeNode(CstKind.TraitDecl, children);
  }

  // ── Models (Section 6) ──────────────────────────────────

  private parseModelDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.TYPE_NAME, children);
    this.expect(TokenKind.EQUALS, children);

    // Optional model kind: ephemeral | immutable
    this.skipTrivia(children);
    if (this.checkAny(TokenKind.KW_EPHEMERAL, TokenKind.KW_IMMUTABLE)) {
      children.push(this.advance());
    }

    this.expect(TokenKind.OPEN_BRACE, children);

    // Inside braces, INDENT/DEDENT are suppressed by lexer.
    // Fields are separated by NEWLINE (block form) or ; (inline form).
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.CLOSE_BRACE) || this.check(TokenKind.EOF)) break;

      if (this.check(TokenKind.SPREAD)) {
        children.push(this.parseSpreadField());
      } else if (this.check(TokenKind.KW_TTL)) {
        children.push(this.parseTtlDecl());
      } else if (this.check(TokenKind.KW_RETAIN)) {
        children.push(this.parseRetainDecl());
      } else if (this.check(TokenKind.KW_ALWAYS)) {
        children.push(this.parseAlwaysBlock());
      } else if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.parseFieldDecl());
      } else {
        children.push(this.advance()); // skip unknown
      }

      // Optional ; separator (inline form)
      this.eat(TokenKind.SEMICOLON, children);
    }

    this.expect(TokenKind.CLOSE_BRACE, children);
    return this.makeNode(CstKind.ModelDecl, children);
  }

  private parseFieldDecl(): CstNode {
    const children: CstChild[] = [];

    // field_name [?] : TypeRef { , modifier } [ = literal ]
    // Field name can be IDENTIFIER or a keyword used as identifier (e.g., "code", "type")
    const pk = this.peek().kind;
    if (pk === TokenKind.IDENTIFIER || this.isKeywordToken(pk)) {
      this.skipTrivia(children);
      children.push(this.advance());
    } else {
      this.expect(TokenKind.IDENTIFIER, children);
    }
    this.eat(TokenKind.QUESTION, children);

    if (this.eat(TokenKind.COLON, children)) {
      children.push(this.parseTypeRef());

      // Field modifiers: , generated, , unique, etc.
      while (this.eat(TokenKind.COMMA, children)) {
        this.skipTrivia(children);
        const t = this.peek();
        if (t.kind === TokenKind.KW_GENERATED || t.kind === TokenKind.KW_UNIQUE ||
            t.kind === TokenKind.KW_SECRET || t.kind === TokenKind.KW_COMPUTED ||
            t.kind === TokenKind.IDENTIFIER) {
          children.push(this.advance());
        } else {
          break;
        }
      }
    }

    // Optional default value: = literal
    if (this.eat(TokenKind.EQUALS, children)) {
      children.push(this.parseLiteral());
    }

    return this.makeNode(CstKind.FieldDecl, children);
  }

  private parseSpreadField(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.SPREAD, children);
    this.expect(TokenKind.TYPE_NAME, children);
    return this.makeNode(CstKind.SpreadField, children);
  }

  private parseTtlDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_TTL, children);
    this.expect(TokenKind.COLON, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.DURATION)) {
      children.push(this.advance());
    }
    return this.makeNode(CstKind.TtlDecl, children);
  }

  private parseRetainDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_RETAIN, children);
    this.expect(TokenKind.COLON, children);
    this.skipTrivia(children);
    if (this.checkAny(TokenKind.INT_LITERAL, TokenKind.KW_FOREVER, TokenKind.IDENTIFIER)) {
      children.push(this.advance());
      // Optional unit: days, years
      this.skipTrivia(children);
      if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.advance());
      }
    }
    return this.makeNode(CstKind.RetainDecl, children);
  }

  // ── Enums (Section 7) ───────────────────────────────────

  private parseEnumDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.TYPE_NAME, children);
    this.expect(TokenKind.EQUALS, children);

    // value { | value }
    this.skipTrivia(children);
    if (this.peek().kind === TokenKind.IDENTIFIER) {
      children.push(this.advance());
    }
    while (this.eat(TokenKind.PIPE, children)) {
      this.skipTrivia(children);
      if (this.peek().kind === TokenKind.IDENTIFIER) {
        children.push(this.advance());
      }
    }

    return this.makeNode(CstKind.EnumDecl, children);
  }

  // ── Errors (Section 8) ──────────────────────────────────

  private parseErrorDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.TYPE_NAME, children);
    this.expect(TokenKind.EQUALS, children);
    this.expect(TokenKind.KW_ERROR, children);
    this.expect(TokenKind.OPEN_BRACE, children);

    // Inside braces, INDENT/DEDENT are suppressed by lexer.
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.CLOSE_BRACE) || this.check(TokenKind.EOF)) break;
      children.push(this.parseErrorField());
    }

    this.expect(TokenKind.CLOSE_BRACE, children);
    return this.makeNode(CstKind.ErrorDecl, children);
  }

  private parseErrorField(): CstNode {
    const children: CstChild[] = [];
    this.skipTrivia(children);
    // Field name can be IDENTIFIER or a keyword used as identifier (e.g., "code")
    const pk = this.peek().kind;
    if (pk === TokenKind.IDENTIFIER || pk === TokenKind.TYPE_NAME || this.isKeywordToken(pk)) {
      children.push(this.advance());
    }
    if (this.eat(TokenKind.EQUALS, children)) {
      children.push(this.parseLiteral());
    } else if (this.eat(TokenKind.COLON, children)) {
      children.push(this.parseTypeRef());
      if (this.eat(TokenKind.EQUALS, children)) {
        children.push(this.parseLiteral());
      }
    }
    // Safety: if nothing was consumed, advance to prevent infinite loop
    if (children.length === 0) {
      children.push(this.advance());
    }
    return this.makeNode(CstKind.ErrorField, children);
  }

  /** Check if a token kind is a keyword that could be used as a field name. */
  private isKeywordToken(kind: TokenKind): boolean {
    // Keywords that might appear as identifiers in field name positions
    return kind.startsWith('KW_') || kind === TokenKind.KIT_KEYWORD;
  }

  // ── Constants (Section 9) ───────────────────────────────

  private parseConstDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.UPPER_IDENTIFIER, children);
    this.expect(TokenKind.EQUALS, children);
    children.push(this.parseLiteral());
    return this.makeNode(CstKind.ConstDecl, children);
  }

  // ── State Machines (Section 10) ─────────────────────────

  private parseStateDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_STATE, children);
    this.expect(TokenKind.TYPE_NAME, children);
    this.expect(TokenKind.KW_FOR, children);
    this.expect(TokenKind.TYPE_NAME, children);
    this.expect(TokenKind.DOT, children);
    this.expect(TokenKind.IDENTIFIER, children);
    this.expect(TokenKind.COLON, children);

    if (this.eat(TokenKind.INDENT, children)) {
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

        // State hook: on enter/while
        if (this.check(TokenKind.KW_ON)) {
          children.push(this.parseStateHook());
        } else if (this.check(TokenKind.IDENTIFIER)) {
          // Transition line
          children.push(this.parseTransitionLine());
        } else {
          children.push(this.advance());
        }
      }
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.StateDecl, children);
  }

  private parseTransitionLine(): CstNode {
    const children: CstChild[] = [];
    // identifier { -> identifier } [ when prose ]
    this.skipTrivia(children);
    if (this.check(TokenKind.IDENTIFIER)) {
      children.push(this.advance());
    }
    while (this.eat(TokenKind.ARROW, children)) {
      this.skipTrivia(children);
      if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.advance());
      }
    }
    if (this.eat(TokenKind.KW_WHEN, children)) {
      children.push(this.collectInlineProse(children));
    }
    return this.makeNode(CstKind.TransitionLine, children);
  }

  private parseStateHook(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_ON, children);
    this.skipTrivia(children);

    if (this.check(TokenKind.KW_ENTER)) {
      // on enter state_name:
      children.push(this.advance());
      this.skipTrivia(children);
      if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.advance());
      }
      this.expect(TokenKind.COLON, children);
    } else if (this.check(TokenKind.IDENTIFIER)) {
      // on event while state:
      children.push(this.advance());
      this.expect(TokenKind.KW_WHILE, children);
      this.skipTrivia(children);
      if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.advance());
      }
      this.expect(TokenKind.COLON, children);
    }

    if (this.eat(TokenKind.INDENT, children)) {
      children.push(this.collectProseBlock(children));
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.StateHook, children);
  }

  // ── Modules (Section 11) ────────────────────────────────

  private parseModuleDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_MODULE, children);
    this.expect(TokenKind.IDENTIFIER, children);

    if (!this.eat(TokenKind.INDENT, children)) {
      return this.makeNode(CstKind.ModuleDecl, children);
    }

    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

      const t = this.peek();
      if (t.kind === TokenKind.PROSE && t.text.startsWith('>')) {
        children.push(this.parseContextLine());
      } else if (t.kind === TokenKind.GT) {
        children.push(this.parseContextLine());
      } else if (t.kind === TokenKind.KW_NEEDS) {
        children.push(this.parseNeedsLine());
      } else if (t.kind === TokenKind.KW_BEFORE) {
        children.push(this.parseProseKeywordBlock(CstKind.BeforeBlock, TokenKind.KW_BEFORE));
      } else if (t.kind === TokenKind.KW_AFTER) {
        children.push(this.parseProseKeywordBlock(CstKind.AfterBlock, TokenKind.KW_AFTER));
      } else if (t.kind === TokenKind.KW_TO) {
        children.push(this.parseIntentDecl());
      } else if (t.kind === TokenKind.KW_FN) {
        children.push(this.parseFnDecl());
      } else if (t.kind === TokenKind.KW_FLOW) {
        children.push(this.parseFlowDecl());
      } else if (t.kind === TokenKind.KW_ON) {
        children.push(this.parseOnHandler());
      } else {
        // Unknown — skip line
        children.push(this.advance());
      }
    }

    this.eat(TokenKind.DEDENT, children);
    return this.makeNode(CstKind.ModuleDecl, children);
  }

  private parseNeedsLine(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_NEEDS, children);
    this.expect(TokenKind.COLON, children);

    // identifier/type_name { , identifier/type_name }
    this.skipTrivia(children);
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      const t = this.peek();
      if (t.kind === TokenKind.IDENTIFIER || t.kind === TokenKind.TYPE_NAME) {
        children.push(this.advance());
      } else {
        break;
      }
      if (!this.eat(TokenKind.COMMA, children)) break;
    }

    return this.makeNode(CstKind.NeedsLine, children);
  }

  // ── Intents (Section 12) ────────────────────────────────

  private parseIntentDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_TO, children);
    this.expect(TokenKind.IDENTIFIER, children);

    // Parameter list
    this.expect(TokenKind.OPEN_PAREN, children);
    if (!this.check(TokenKind.CLOSE_PAREN)) {
      children.push(this.parseParamList());
    }
    this.expect(TokenKind.CLOSE_PAREN, children);

    // Optional return type — may be on the same line or the next indented line
    this.skipTrivia(children);
    // The return type may follow an INDENT if it's on the next line
    const hadIndent = this.eat(TokenKind.INDENT, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.ARROW)) {
      children.push(this.advance());
      children.push(this.parseTypeRef());
    }

    // Body — if we already ate an INDENT above (for the return type on next line),
    // the body continues at this indent level
    if (hadIndent) {
      this.parseIntentBody(children);
      this.eat(TokenKind.DEDENT, children);
    } else if (this.eat(TokenKind.INDENT, children)) {
      this.parseIntentBody(children);
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.IntentDecl, children);
  }

  private parseIntentBody(children: CstChild[]): void {
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

      const t = this.peek();
      if (t.kind === TokenKind.KW_ROUTE) {
        children.push(this.parseMetadataLine());
      } else if (t.kind === TokenKind.KW_SAVES || t.kind === TokenKind.KW_EMITS ||
                 t.kind === TokenKind.KW_USES || t.kind === TokenKind.KW_NEEDS) {
        children.push(this.parseMetadataLine());
      } else if (t.kind === TokenKind.KW_SOCKET || t.kind === TokenKind.KW_SCHEDULE) {
        children.push(this.parseMetadataLine());
      } else if (t.kind === TokenKind.KW_GUARD) {
        children.push(this.parseProseKeywordBlock(CstKind.MetadataLine, TokenKind.KW_GUARD));
      } else if (t.kind === TokenKind.KW_PUBLIC || t.kind === TokenKind.KW_ASYNC || t.kind === TokenKind.KW_TRACE) {
        const mc: CstChild[] = [this.advance()];
        children.push(this.makeNode(CstKind.MetadataLine, mc));
      } else if (t.kind === TokenKind.KW_DO) {
        children.push(this.parseProseKeywordBlock(CstKind.DoBlock, TokenKind.KW_DO));
      } else if (t.kind === TokenKind.KW_CODE) {
        children.push(this.parseProseKeywordBlock(CstKind.CodeBlock, TokenKind.KW_CODE));
      } else if (t.kind === TokenKind.KW_MUST) {
        children.push(this.parseMustBlock());
      } else if (t.kind === TokenKind.KW_ENSURE) {
        children.push(this.parseProseKeywordBlock(CstKind.EnsureBlock, TokenKind.KW_ENSURE));
      } else if (t.kind === TokenKind.KW_EG) {
        children.push(this.parseProseKeywordBlock(CstKind.EgBlock, TokenKind.KW_EG));
      } else if (t.kind === TokenKind.KW_FAILS) {
        children.push(this.parseProseKeywordBlock(CstKind.FailsBlock, TokenKind.KW_FAILS));
      } else if (t.kind === TokenKind.PROSE || t.kind === TokenKind.GT) {
        children.push(this.parseContextLine());
      } else {
        // Unknown in intent body — collect as prose
        children.push(this.advance());
      }
    }
  }

  private parseMetadataLine(): CstNode {
    const children: CstChild[] = [];
    // keyword: value
    children.push(this.advance()); // keyword token
    this.expect(TokenKind.COLON, children);

    // Collect the rest of the line
    this.skipTrivia(children);
    // For route: need HTTP method + path
    const prevKind = (children[0] as Token).kind;
    if (prevKind === TokenKind.KW_ROUTE) {
      this.skipTrivia(children);
      if (this.checkAny(TokenKind.KW_GET, TokenKind.KW_POST, TokenKind.KW_PUT, TokenKind.KW_PATCH, TokenKind.KW_DELETE)) {
        children.push(this.advance()); // HTTP method
      }
      this.skipTrivia(children);
      if (this.check(TokenKind.PATH)) {
        children.push(this.advance()); // path
      }
    } else {
      // saves:, emits:, uses:, needs: — comma-separated names on the same line
      // Use current() not peek() so we stop at NEWLINE (peek skips trivia including newlines)
      while (this.pos < this.tokens.length) {
        const t = this.current();
        if (t.kind === TokenKind.NEWLINE || t.kind === TokenKind.DEDENT ||
            t.kind === TokenKind.EOF || t.kind === TokenKind.INDENT) break;
        children.push(this.advance());
      }
    }

    return this.makeNode(CstKind.MetadataLine, children);
  }

  private parseMustBlock(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_MUST, children);
    this.expect(TokenKind.COLON, children);

    this.skipTrivia(children);
    if (this.check(TokenKind.INDENT)) {
      children.push(this.advance());
      children.push(this.collectProseBlock(children));
      this.eat(TokenKind.DEDENT, children);
    } else {
      // Inline must
      children.push(this.collectInlineProse(children));
      // Optional indented continuation
      this.skipTrivia(children);
      if (this.eat(TokenKind.INDENT, children)) {
        children.push(this.collectProseBlock(children));
        this.eat(TokenKind.DEDENT, children);
      }
    }

    return this.makeNode(CstKind.MustBlock, children);
  }

  private parseParamList(): CstNode {
    const children: CstChild[] = [];

    children.push(this.parseParam());
    while (this.eat(TokenKind.COMMA, children)) {
      children.push(this.parseParam());
    }

    return this.makeNode(CstKind.ParamList, children);
  }

  private parseParam(): CstNode {
    const children: CstChild[] = [];
    this.skipTrivia(children);

    // identifier [?] [: TypeRef] [= literal]
    if (this.check(TokenKind.IDENTIFIER)) {
      children.push(this.advance());
    } else if (this.check(TokenKind.TYPE_NAME)) {
      // Sometimes param names look like type names (edge case)
      children.push(this.advance());
    }

    this.eat(TokenKind.QUESTION, children);

    if (this.eat(TokenKind.COLON, children)) {
      children.push(this.parseTypeRef());
    }

    if (this.eat(TokenKind.EQUALS, children)) {
      children.push(this.parseLiteral());
    }

    return this.makeNode(CstKind.Param, children);
  }

  // ── Functions (Section 13) ──────────────────────────────

  private parseFnDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_FN, children);
    this.expect(TokenKind.IDENTIFIER, children);

    this.expect(TokenKind.OPEN_PAREN, children);
    if (!this.check(TokenKind.CLOSE_PAREN)) {
      children.push(this.parseParamList());
    }
    this.expect(TokenKind.CLOSE_PAREN, children);

    // Return type may be on same or next indented line
    this.skipTrivia(children);
    const hadIndent = this.eat(TokenKind.INDENT, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.ARROW)) {
      children.push(this.advance());
      children.push(this.parseTypeRef());
    }

    if (hadIndent || this.eat(TokenKind.INDENT, children)) {
      // fn body: context lines, prose/code, must, ensure, eg
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

        const t = this.peek();
        if (t.kind === TokenKind.PROSE || t.kind === TokenKind.GT) {
          children.push(this.parseContextLine());
        } else if (t.kind === TokenKind.KW_MUST) {
          children.push(this.parseMustBlock());
        } else if (t.kind === TokenKind.KW_ENSURE) {
          children.push(this.parseProseKeywordBlock(CstKind.EnsureBlock, TokenKind.KW_ENSURE));
        } else if (t.kind === TokenKind.KW_EG) {
          children.push(this.parseProseKeywordBlock(CstKind.EgBlock, TokenKind.KW_EG));
        } else if (t.kind === TokenKind.KW_CODE) {
          children.push(this.parseProseKeywordBlock(CstKind.CodeBlock, TokenKind.KW_CODE));
        } else {
          // Collect as prose
          children.push(this.collectInlineProse(children));
        }
      }
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.FnDecl, children);
  }

  // ── Flows (Section 14) ──────────────────────────────────

  private parseFlowDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_FLOW, children);
    this.expect(TokenKind.IDENTIFIER, children);

    this.expect(TokenKind.OPEN_PAREN, children);
    if (!this.check(TokenKind.CLOSE_PAREN)) {
      children.push(this.parseParamList());
    }
    this.expect(TokenKind.CLOSE_PAREN, children);

    // Return type may be on same or next indented line
    this.skipTrivia(children);
    const hadIndent = this.eat(TokenKind.INDENT, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.ARROW)) {
      children.push(this.advance());
      children.push(this.parseTypeRef());
    }

    if (hadIndent || this.eat(TokenKind.INDENT, children)) {
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

        const t = this.peek();
        if (t.kind === TokenKind.KW_STAGE) {
          children.push(this.parseStageBlock());
        } else if (t.kind === TokenKind.KW_MUST) {
          children.push(this.parseMustBlock());
        } else if (t.kind === TokenKind.KW_ENSURE) {
          children.push(this.parseProseKeywordBlock(CstKind.EnsureBlock, TokenKind.KW_ENSURE));
        } else if (t.kind === TokenKind.KW_ROUTE || t.kind === TokenKind.KW_SAVES ||
                   t.kind === TokenKind.KW_EMITS || t.kind === TokenKind.KW_USES ||
                   t.kind === TokenKind.KW_NEEDS || t.kind === TokenKind.KW_PUBLIC ||
                   t.kind === TokenKind.KW_ASYNC || t.kind === TokenKind.KW_TRACE) {
          children.push(this.parseMetadataLine());
        } else {
          children.push(this.advance());
        }
      }
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.FlowDecl, children);
  }

  private parseStageBlock(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_STAGE, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.IDENTIFIER)) {
      children.push(this.advance());
    }
    this.expect(TokenKind.COLON, children);

    if (this.eat(TokenKind.INDENT, children)) {
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

        if (this.check(TokenKind.KW_COMPENSATE)) {
          children.push(this.parseProseKeywordBlock(CstKind.CompensateBlock, TokenKind.KW_COMPENSATE));
        } else if (this.check(TokenKind.INDENT)) {
          // Nested indented block within stage — skip it as prose
          children.push(this.advance()); // INDENT
          const proseChildren: CstChild[] = [];
          this.skipBlock(proseChildren);
          children.push(this.makeNode(CstKind.ProseContent, proseChildren));
          this.eat(TokenKind.DEDENT, children);
        } else {
          // Stage body is prose — collect current line
          children.push(this.collectInlineProse(children));
        }
      }
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.StageBlock, children);
  }

  // ── Event Handlers (Section 15) ─────────────────────────

  private parseOnHandler(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_ON, children);

    // on event_name(params) [when prose]:
    this.skipTrivia(children);
    if (this.check(TokenKind.IDENTIFIER)) {
      children.push(this.advance());
    }

    // Optional params
    if (this.eat(TokenKind.OPEN_PAREN, children)) {
      if (!this.check(TokenKind.CLOSE_PAREN)) {
        children.push(this.parseParamList());
      }
      this.expect(TokenKind.CLOSE_PAREN, children);
    }

    // Optional when clause
    if (this.eat(TokenKind.KW_WHEN, children)) {
      children.push(this.collectInlineProse(children));
    }

    // Colon
    this.eat(TokenKind.COLON, children);

    // Body
    if (this.eat(TokenKind.INDENT, children)) {
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;
        // Collect body as prose or check for metadata
        children.push(this.collectInlineProse(children));
      }
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.OnHandler, children);
  }

  // ── Kit Constructs (Section 16) ─────────────────────────

  private parseKitConstruct(): CstNode {
    const children: CstChild[] = [];
    // KIT_KEYWORD name [inline-content]
    this.expect(TokenKind.KIT_KEYWORD, children);
    this.skipTrivia(children);

    // Optional name (PascalCase or identifier)
    if (this.checkAny(TokenKind.TYPE_NAME, TokenKind.IDENTIFIER)) {
      children.push(this.advance());
    }

    // Collect any remaining inline content on the same line (e.g., ": ServiceName = value")
    // Use current() to stop at NEWLINE
    while (this.pos < this.tokens.length) {
      const t = this.current();
      if (t.kind === TokenKind.NEWLINE || t.kind === TokenKind.EOF ||
          t.kind === TokenKind.INDENT || t.kind === TokenKind.DEDENT ||
          t.kind === TokenKind.OPEN_BRACE) break;
      children.push(this.advance());
    }

    // Body: either { ... } or INDENT ... DEDENT
    this.skipTrivia(children);
    if (this.check(TokenKind.OPEN_BRACE)) {
      // Brace form — INDENT/DEDENT suppressed inside braces, so parse until CLOSE_BRACE
      children.push(this.advance());
      this.parseKitConstructBody(children);
      this.expect(TokenKind.CLOSE_BRACE, children);
    } else if (this.check(TokenKind.INDENT)) {
      // Indented form
      children.push(this.advance());
      this.parseKitConstructBody(children);
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.KitConstruct, children);
  }

  private parseKitConstructBody(children: CstChild[]): void {
    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.DEDENT) || this.check(TokenKind.CLOSE_BRACE) || this.check(TokenKind.EOF)) break;

      const t = this.peek();
      // Sub-constructs that kits commonly use
      if (t.kind === TokenKind.PROSE || t.kind === TokenKind.GT) {
        children.push(this.parseContextLine());
      } else if (t.kind === TokenKind.KW_ROUTE || t.kind === TokenKind.KW_GUARD ||
                 t.kind === TokenKind.KW_SAVES || t.kind === TokenKind.KW_EMITS ||
                 t.kind === TokenKind.KW_USES || t.kind === TokenKind.KW_NEEDS) {
        children.push(this.parseMetadataLine());
      } else if (t.kind === TokenKind.KW_ALWAYS) {
        children.push(this.parseAlwaysBlock());
      } else if (t.kind === TokenKind.KW_MUST) {
        children.push(this.parseMustBlock());
      } else if (t.kind === TokenKind.KW_TO) {
        children.push(this.parseIntentDecl());
      } else if (t.kind === TokenKind.KW_FN) {
        children.push(this.parseFnDecl());
      } else if (t.kind === TokenKind.KW_FLOW) {
        children.push(this.parseFlowDecl());
      } else if (t.kind === TokenKind.KW_ON) {
        children.push(this.parseOnHandler());
      } else if (t.kind === TokenKind.KIT_KEYWORD) {
        // Nested kit construct (e.g., arg/flag inside command)
        children.push(this.parseKitConstruct());
      } else if (t.kind === TokenKind.KW_DO) {
        children.push(this.parseProseKeywordBlock(CstKind.DoBlock, TokenKind.KW_DO));
      } else if (t.kind === TokenKind.KW_CODE) {
        children.push(this.parseProseKeywordBlock(CstKind.CodeBlock, TokenKind.KW_CODE));
      } else if (t.kind === TokenKind.IDENTIFIER) {
        // Kit block: identifier: ...
        if (this.peekAhead(1).kind === TokenKind.COLON) {
          children.push(this.parseKitBlock());
        } else {
          children.push(this.parseFieldDecl());
        }
      } else if (t.kind === TokenKind.KW_ENSURE) {
        children.push(this.parseProseKeywordBlock(CstKind.EnsureBlock, TokenKind.KW_ENSURE));
      } else if (t.kind === TokenKind.KW_EG) {
        children.push(this.parseProseKeywordBlock(CstKind.EgBlock, TokenKind.KW_EG));
      } else if (t.kind === TokenKind.KW_FAILS) {
        children.push(this.parseProseKeywordBlock(CstKind.FailsBlock, TokenKind.KW_FAILS));
      } else {
        children.push(this.collectInlineProse(children));
      }
    }
  }

  private parseKitBlock(): CstNode {
    const children: CstChild[] = [];
    // identifier: value (inline or block)
    children.push(this.advance()); // identifier
    this.expect(TokenKind.COLON, children);

    this.skipTrivia(children);
    if (this.check(TokenKind.INDENT)) {
      children.push(this.advance());
      children.push(this.collectProseBlock(children));
      this.eat(TokenKind.DEDENT, children);
    } else if (this.check(TokenKind.OPEN_BRACKET)) {
      children.push(this.parseInlineList());
    } else if (this.check(TokenKind.OPEN_BRACE)) {
      children.push(this.parseInlineObject());
    } else {
      children.push(this.collectInlineProse(children));
    }

    return this.makeNode(CstKind.KitBlock, children);
  }

  // ── Tests (Section 17) ──────────────────────────────────

  private parseTestDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_TEST, children);
    this.expect(TokenKind.IDENTIFIER, children);

    if (!this.eat(TokenKind.INDENT, children)) {
      return this.makeNode(CstKind.TestDecl, children);
    }

    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

      const t = this.peek();
      if (t.kind === TokenKind.KW_GIVEN) {
        children.push(this.parseGivenBlock());
      } else if (t.kind === TokenKind.KW_CALL) {
        children.push(this.parseCallStep());
      } else if (t.kind === TokenKind.KW_TRIGGER) {
        children.push(this.parseTriggerStep());
      } else if (t.kind === TokenKind.KW_THEN) {
        children.push(this.parseThenStep());
      } else if (t.kind === TokenKind.KW_EXPECT) {
        children.push(this.parseExpectStep());
      } else if (t.kind === TokenKind.KW_MUST) {
        children.push(this.parseMustFailStep());
      } else if (t.kind === TokenKind.KW_AS) {
        children.push(this.parseAsContextStep());
      } else {
        children.push(this.collectInlineProse(children));
      }
    }

    this.eat(TokenKind.DEDENT, children);
    return this.makeNode(CstKind.TestDecl, children);
  }

  private parseGivenBlock(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_GIVEN, children);
    this.expect(TokenKind.COLON, children);

    this.skipTrivia(children);
    if (this.check(TokenKind.INDENT)) {
      children.push(this.advance());
      children.push(this.collectProseBlock(children));
      this.eat(TokenKind.DEDENT, children);
    } else {
      children.push(this.collectInlineProse(children));
    }

    return this.makeNode(CstKind.GivenBlock, children);
  }

  private parseCallStep(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_CALL, children);

    // dotted_name ( args ) [ as identifier ]
    children.push(this.collectInlineProse(children));

    return this.makeNode(CstKind.CallStep, children);
  }

  private parseTriggerStep(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_TRIGGER, children);
    children.push(this.collectInlineProse(children));
    return this.makeNode(CstKind.TriggerStep, children);
  }

  private parseThenStep(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_THEN, children);

    this.skipTrivia(children);
    if (this.check(TokenKind.KW_CALL)) {
      children.push(this.parseCallStep());
    } else {
      children.push(this.collectInlineProse(children));
    }

    return this.makeNode(CstKind.ThenStep, children);
  }

  private parseExpectStep(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_EXPECT, children);

    this.skipTrivia(children);
    // Check for "expect after <dur>:" or "expect client X receives:"
    if (this.check(TokenKind.KW_AFTER)) {
      children.push(this.advance());
      this.skipTrivia(children);
      if (this.check(TokenKind.DURATION)) {
        children.push(this.advance());
      }
      this.expect(TokenKind.COLON, children);

      if (this.eat(TokenKind.INDENT, children)) {
        children.push(this.collectProseBlock(children));
        this.eat(TokenKind.DEDENT, children);
      } else {
        children.push(this.collectInlineProse(children));
      }
      return this.makeNode(CstKind.ExpectAfterStep, children);
    }

    if (this.check(TokenKind.KW_CLIENT)) {
      children.push(this.advance());
      this.skipTrivia(children);
      if (this.check(TokenKind.IDENTIFIER) || this.check(TokenKind.TYPE_NAME)) {
        children.push(this.advance());
      }
      this.skipTrivia(children);
      if (this.check(TokenKind.KW_RECEIVES)) {
        children.push(this.advance());
      }
      this.expect(TokenKind.COLON, children);

      if (this.eat(TokenKind.INDENT, children)) {
        children.push(this.collectProseBlock(children));
        this.eat(TokenKind.DEDENT, children);
      }
      return this.makeNode(CstKind.ExpectClientStep, children);
    }

    // Regular expect:
    this.expect(TokenKind.COLON, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.INDENT)) {
      children.push(this.advance());
      children.push(this.collectProseBlock(children));
      this.eat(TokenKind.DEDENT, children);
    } else {
      children.push(this.collectInlineProse(children));
    }

    return this.makeNode(CstKind.ExpectStep, children);
  }

  private parseMustFailStep(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_MUST, children);

    this.skipTrivia(children);
    if (this.check(TokenKind.KW_FAIL)) {
      children.push(this.advance());
    }
    this.expect(TokenKind.COLON, children);

    this.skipTrivia(children);
    if (this.check(TokenKind.INDENT)) {
      children.push(this.advance());
      children.push(this.collectProseBlock(children));
      this.eat(TokenKind.DEDENT, children);
    } else {
      children.push(this.collectInlineProse(children));
    }

    return this.makeNode(CstKind.MustFailStep, children);
  }

  private parseAsContextStep(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_AS, children);

    // as X [in Y]:
    this.skipTrivia(children);
    if (this.checkAny(TokenKind.IDENTIFIER, TokenKind.TYPE_NAME)) {
      children.push(this.advance());
    }

    if (this.eat(TokenKind.KW_IN, children)) {
      this.skipTrivia(children);
      if (this.checkAny(TokenKind.IDENTIFIER, TokenKind.TYPE_NAME)) {
        children.push(this.advance());
      }
    }

    this.eat(TokenKind.COLON, children);

    if (this.eat(TokenKind.INDENT, children)) {
      while (this.pos < this.tokens.length) {
        this.skipTrivia(children);
        if (this.check(TokenKind.DEDENT) || this.check(TokenKind.EOF)) break;

        const t = this.peek();
        if (t.kind === TokenKind.KW_CALL) {
          children.push(this.parseCallStep());
        } else if (t.kind === TokenKind.KW_EXPECT) {
          children.push(this.parseExpectStep());
        } else if (t.kind === TokenKind.KW_MUST) {
          children.push(this.parseMustFailStep());
        } else if (t.kind === TokenKind.KW_THEN) {
          children.push(this.parseThenStep());
        } else {
          children.push(this.collectInlineProse(children));
        }
      }
      this.eat(TokenKind.DEDENT, children);
    }

    return this.makeNode(CstKind.AsContextStep, children);
  }

  // ── Type References (Section 18) ────────────────────────

  private parseTypeRef(): CstNode {
    const children: CstChild[] = [];

    children.push(this.parseBaseType());

    // Optional ? and []
    this.skipTrivia(children);
    this.eat(TokenKind.QUESTION, children);
    if (this.eat(TokenKind.OPEN_BRACKET, children)) {
      // Could be [] or [n] or [n..m]
      this.skipTrivia(children);
      if (!this.check(TokenKind.CLOSE_BRACKET)) {
        // Cardinality: int or int..int/n
        if (this.check(TokenKind.INT_LITERAL)) {
          children.push(this.advance());
          if (this.eat(TokenKind.DOT, children)) {
            this.eat(TokenKind.DOT, children);
            this.skipTrivia(children);
            if (this.checkAny(TokenKind.INT_LITERAL, TokenKind.IDENTIFIER)) {
              children.push(this.advance());
            }
          }
        }
      }
      this.expect(TokenKind.CLOSE_BRACKET, children);
    }

    // Union types: | BaseType [?] [[]]
    while (this.eat(TokenKind.PIPE, children)) {
      children.push(this.parseBaseType());
      this.eat(TokenKind.QUESTION, children);
      if (this.eat(TokenKind.OPEN_BRACKET, children)) {
        this.skipTrivia(children);
        if (!this.check(TokenKind.CLOSE_BRACKET)) {
          if (this.check(TokenKind.INT_LITERAL)) {
            children.push(this.advance());
          }
        }
        this.expect(TokenKind.CLOSE_BRACKET, children);
      }
    }

    return this.makeNode(CstKind.TypeRef, children);
  }

  private parseBaseType(): CstNode {
    const children: CstChild[] = [];
    this.skipTrivia(children);

    const t = this.peek();

    // Primitive types
    if (t.kind === TokenKind.KW_STRING || t.kind === TokenKind.KW_INT ||
        t.kind === TokenKind.KW_FLOAT || t.kind === TokenKind.KW_DECIMAL ||
        t.kind === TokenKind.KW_NUMBER || t.kind === TokenKind.KW_BOOL ||
        t.kind === TokenKind.KW_DATE || t.kind === TokenKind.KW_DATETIME ||
        t.kind === TokenKind.KW_BYTES || t.kind === TokenKind.KW_ANY ||
        t.kind === TokenKind.KW_VOID) {
      children.push(this.advance());
      return this.makeNode(CstKind.TypeRef, children);
    }

    // result<T>
    if (t.kind === TokenKind.KW_RESULT) {
      children.push(this.advance());
      // < is actually > ... hmm, GIST uses result<T> but < > aren't separate tokens
      // The lexer would tokenize < as an identifier. Let's handle the angle brackets
      this.skipTrivia(children);
      // < might be tokenized as IDENTIFIER '<' since we handle it in switch
      // Actually, just consume tokens until we find what looks right
      if (this.check(TokenKind.IDENTIFIER) && this.current().text === '<') {
        children.push(this.advance());
        children.push(this.parseTypeRef());
        this.skipTrivia(children);
        if (this.peek().kind === TokenKind.GT) {
          children.push(this.advance());
        }
      }
      return this.makeNode(CstKind.TypeRef, children);
    }

    // map<K, V>
    if (t.kind === TokenKind.KW_MAP) {
      children.push(this.advance());
      this.skipTrivia(children);
      if (this.check(TokenKind.IDENTIFIER) && this.current().text === '<') {
        children.push(this.advance());
        children.push(this.parseTypeRef());
        this.expect(TokenKind.COMMA, children);
        children.push(this.parseTypeRef());
        this.skipTrivia(children);
        if (this.peek().kind === TokenKind.GT) {
          children.push(this.advance());
        }
      }
      return this.makeNode(CstKind.TypeRef, children);
    }

    // -> Model reference
    if (t.kind === TokenKind.ARROW) {
      children.push(this.advance());
      this.skipTrivia(children);
      if (this.check(TokenKind.TYPE_NAME)) {
        children.push(this.advance());
      }
      return this.makeNode(CstKind.TypeRef, children);
    }

    // error type
    if (t.kind === TokenKind.KW_ERROR) {
      children.push(this.advance());
      return this.makeNode(CstKind.TypeRef, children);
    }

    // Inline struct { ... }
    if (t.kind === TokenKind.OPEN_BRACE) {
      children.push(this.parseInlineFieldList());
      return this.makeNode(CstKind.TypeRef, children);
    }

    // Named type (PascalCase)
    if (t.kind === TokenKind.TYPE_NAME) {
      children.push(this.advance());
      return this.makeNode(CstKind.TypeRef, children);
    }

    // Identifier that might be a type name in some contexts
    if (t.kind === TokenKind.IDENTIFIER) {
      children.push(this.advance());
      return this.makeNode(CstKind.TypeRef, children);
    }

    // Error: unexpected token in type position
    this.error(`Expected type, got ${t.kind} ('${t.text}')`, t.span);
    children.push(this.advance());
    return this.makeNode(CstKind.TypeRef, children);
  }

  private parseInlineFieldList(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.OPEN_BRACE, children);

    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.CLOSE_BRACE) || this.check(TokenKind.EOF)) break;
      if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.parseFieldDecl());
      } else {
        children.push(this.advance());
      }
      this.eat(TokenKind.COMMA, children);
      this.eat(TokenKind.SEMICOLON, children);
    }

    this.expect(TokenKind.CLOSE_BRACE, children);
    return this.makeNode(CstKind.InlineObject, children);
  }

  // ── Composition (Section 19) ────────────────────────────

  private parseUseDecl(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.KW_USE, children);
    this.skipTrivia(children);
    if (this.check(TokenKind.STRING_LITERAL)) {
      children.push(this.advance());
    }
    this.skipTrivia(children);
    if (this.check(TokenKind.KW_AS)) {
      children.push(this.advance());
      this.skipTrivia(children);
      if (this.check(TokenKind.IDENTIFIER)) {
        children.push(this.advance());
      }
    }
    return this.makeNode(CstKind.UseDecl, children);
  }

  // ── Common Productions (Section 20) ─────────────────────

  private parseLiteral(): CstNode {
    const children: CstChild[] = [];
    this.skipTrivia(children);

    const t = this.peek();
    if (t.kind === TokenKind.STRING_LITERAL || t.kind === TokenKind.INT_LITERAL ||
        t.kind === TokenKind.FLOAT_LITERAL || t.kind === TokenKind.KW_TRUE ||
        t.kind === TokenKind.KW_FALSE || t.kind === TokenKind.KW_NULL ||
        t.kind === TokenKind.KW_UNLIMITED || t.kind === TokenKind.KW_NOW ||
        t.kind === TokenKind.DURATION) {
      children.push(this.advance());
    } else if (t.kind === TokenKind.IDENTIFIER) {
      // Could be an enum value used as a literal
      children.push(this.advance());
    } else {
      this.error(`Expected literal, got ${t.kind}`, t.span);
    }

    return this.makeNode(CstKind.Literal, children);
  }

  private parseInlineObject(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.OPEN_BRACE, children);

    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.CLOSE_BRACE) || this.check(TokenKind.EOF)) break;

      children.push(this.parseInlineField());
      this.eat(TokenKind.COMMA, children);
    }

    this.expect(TokenKind.CLOSE_BRACE, children);
    return this.makeNode(CstKind.InlineObject, children);
  }

  private parseInlineField(): CstNode {
    const children: CstChild[] = [];
    this.skipTrivia(children);
    if (this.check(TokenKind.IDENTIFIER)) {
      children.push(this.advance());
    }
    this.expect(TokenKind.COLON, children);
    this.skipTrivia(children);

    const t = this.peek();
    if (t.kind === TokenKind.OPEN_BRACE) {
      children.push(this.parseInlineObject());
    } else if (t.kind === TokenKind.OPEN_BRACKET) {
      children.push(this.parseInlineList());
    } else {
      children.push(this.parseLiteral());
    }

    return this.makeNode(CstKind.InlineField, children);
  }

  private parseInlineList(): CstNode {
    const children: CstChild[] = [];
    this.expect(TokenKind.OPEN_BRACKET, children);

    while (this.pos < this.tokens.length) {
      this.skipTrivia(children);
      if (this.check(TokenKind.CLOSE_BRACKET) || this.check(TokenKind.EOF)) break;

      const t = this.peek();
      if (t.kind === TokenKind.OPEN_BRACE) {
        children.push(this.parseInlineObject());
      } else {
        children.push(this.parseLiteral());
      }
      this.eat(TokenKind.COMMA, children);
    }

    this.expect(TokenKind.CLOSE_BRACKET, children);
    return this.makeNode(CstKind.InlineList, children);
  }
}
