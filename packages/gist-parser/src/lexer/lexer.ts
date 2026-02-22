import type { Position, TextSpan } from '../common/source-location.js';
import type { Diagnostic } from '../common/diagnostics.js';
import { DiagnosticSeverity } from '../common/diagnostics.js';
import {
  TokenKind,
  KEYWORDS,
  HTTP_METHODS,
  PROSE_BLOCK_KEYWORDS,
  type Token,
} from './tokens.js';
import { IndentTracker } from './indent-tracker.js';

/** Set of kit keywords the lexer should recognize dynamically. */
export interface LexerOptions {
  kitKeywords?: ReadonlySet<string>;
}

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export function lex(source: string, options: LexerOptions = {}): LexResult {
  const lexer = new Lexer(source, options);
  return lexer.tokenize();
}

// ─── Internal ─────────────────────────────────────────────

class Lexer {
  private source: string;
  private pos = 0;
  private line = 0;
  private col = 0;
  private tokens: Token[] = [];
  private diagnostics: Diagnostic[] = [];
  private indentTracker = new IndentTracker();
  private kitKeywords: ReadonlySet<string>;

  /** Brace depth — when > 0, suppress INDENT/DEDENT. */
  private braceDepth = 0;

  /** Whether we're at the start of a line (for indent processing). */
  private atLineStart = true;

  /** Whether the previous meaningful token was a prose-block keyword. */
  private pendingProseBlock: TokenKind | null = null;

  constructor(source: string, options: LexerOptions) {
    this.source = source;
    this.kitKeywords = options.kitKeywords ?? new Set();
  }

  tokenize(): LexResult {
    // Process initial indentation for the first line
    if (this.source.length > 0) {
      this.processLineStart();
    }

    while (this.pos < this.source.length) {
      this.scanToken();
    }

    // Flush remaining DEDENTs
    const dedents = this.indentTracker.flush();
    for (let i = 0; i < dedents; i++) {
      this.emitSynthetic(TokenKind.DEDENT);
    }

    this.emitSynthetic(TokenKind.EOF);
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  // ── Main scan loop ────────────────────────────────────

  private scanToken(): void {
    const ch = this.peek();

    // Skip spaces/tabs (not newlines — those are significant)
    if (ch === ' ' || ch === '\t') {
      this.advance();
      return;
    }

    // Newline
    if (ch === '\n' || (ch === '\r' && this.peekAt(1) === '\n')) {
      this.handleNewline();
      return;
    }
    if (ch === '\r') {
      this.handleNewline();
      return;
    }

    // Check if we need to process prose block content
    if (this.pendingProseBlock !== null && this.atLineStart) {
      this.scanProseBlock();
      return;
    }

    // We're no longer at line start once we start scanning a token
    this.atLineStart = false;

    // Only clear pendingProseBlock if this is NOT a colon (the expected :)
    // or space. The colon follows the keyword (e.g. "do:") and we need to
    // keep the pending flag so that after the colon + newline, prose mode kicks in.
    if (this.pendingProseBlock !== null && ch !== ':') {
      this.pendingProseBlock = null;
    }

    // Line comments
    if (ch === '/' && this.peekAt(1) === '/') {
      this.scanLineComment();
      return;
    }

    // Block comments
    if (ch === '/' && this.peekAt(1) === '*') {
      this.scanBlockComment();
      return;
    }

    // Context lines: > at start of meaningful content
    if (ch === '>' && this.isContextLinePosition()) {
      this.scanContextLine();
      return;
    }

    // String literals
    if (ch === '"') {
      this.scanStringLiteral();
      return;
    }

    // Numbers (and durations)
    if (this.isDigit(ch) || (ch === '-' && this.isDigit(this.peekAt(1)))) {
      this.scanNumber();
      return;
    }

    // Spread operator: ...
    if (ch === '.' && this.peekAt(1) === '.' && this.peekAt(2) === '.') {
      this.emit3(TokenKind.SPREAD);
      return;
    }

    // Arrow: ->
    if (ch === '-' && this.peekAt(1) === '>') {
      this.emit2(TokenKind.ARROW);
      return;
    }

    // Route path: / followed by alpha or :
    if (ch === '/' && this.braceDepth === 0 && this.isRoutePathStart()) {
      this.scanPath();
      return;
    }

    // Single-character and multi-character operators/delimiters
    switch (ch) {
      case '(': this.emit1(TokenKind.OPEN_PAREN); return;
      case ')': this.emit1(TokenKind.CLOSE_PAREN); return;
      case '{':
        this.braceDepth++;
        this.emit1(TokenKind.OPEN_BRACE);
        return;
      case '}':
        if (this.braceDepth > 0) this.braceDepth--;
        this.emit1(TokenKind.CLOSE_BRACE);
        return;
      case '[': this.emit1(TokenKind.OPEN_BRACKET); return;
      case ']': this.emit1(TokenKind.CLOSE_BRACKET); return;
      case ',': this.emit1(TokenKind.COMMA); return;
      case ';': this.emit1(TokenKind.SEMICOLON); return;
      case '.': this.emit1(TokenKind.DOT); return;
      case '|': this.emit1(TokenKind.PIPE); return;
      case '=':
        if (this.peekAt(1) === '>') {
          // => (used in eg: blocks)
          this.emit2(TokenKind.ARROW);
          return;
        }
        if (this.peekAt(1) === '=') {
          this.emit2(TokenKind.EQUALS); // ==
          return;
        }
        this.emit1(TokenKind.EQUALS);
        return;
      case '?': this.emit1(TokenKind.QUESTION); return;
      case ':': this.emit1(TokenKind.COLON); return;
      case '#': this.emit1(TokenKind.HASH); return;
      case '-': this.emit1(TokenKind.IDENTIFIER); return; // standalone dash
      case '!':
        if (this.peekAt(1) === '=') {
          this.emit2(TokenKind.IDENTIFIER); // !=
          return;
        }
        this.emit1(TokenKind.IDENTIFIER); // standalone !
        return;
      case '>':
        if (this.peekAt(1) === '=') {
          this.emit2(TokenKind.IDENTIFIER); // >=
          return;
        }
        this.emit1(TokenKind.GT);
        return;
      case '<':
        if (this.peekAt(1) === '=') {
          this.emit2(TokenKind.IDENTIFIER); // <=
          return;
        }
        this.emit1(TokenKind.IDENTIFIER); // <
        return;
      case '+': this.emit1(TokenKind.IDENTIFIER); return;
      case '*': this.emit1(TokenKind.IDENTIFIER); return;
      case '%': this.emit1(TokenKind.IDENTIFIER); return;
      case '@': this.emit1(TokenKind.IDENTIFIER); return;
      case '\'': this.emit1(TokenKind.IDENTIFIER); return; // single quote in prose
      case '/': this.emit1(TokenKind.SLASH); return; // standalone slash
    }

    // Words (identifiers, keywords, type names)
    if (this.isAlpha(ch) || ch === '_') {
      this.scanWord();
      return;
    }

    // Unrecognized character
    const start = this.position();
    this.advance();
    this.tokens.push({
      kind: TokenKind.ERROR_TOKEN,
      text: ch,
      span: { start, end: this.position() },
    });
    this.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      message: `Unexpected character '${ch}'`,
      span: { start, end: this.position() },
    });
  }

  // ── Newline & indentation ─────────────────────────────

  private handleNewline(): void {
    const start = this.position();
    // Consume \r\n or \n or \r
    if (this.peek() === '\r' && this.peekAt(1) === '\n') {
      this.pos += 2;
    } else {
      this.pos++;
    }
    this.line++;
    this.col = 0;

    // Emit newline token
    this.tokens.push({
      kind: TokenKind.NEWLINE,
      text: '\n',
      span: { start, end: this.position() },
    });

    this.atLineStart = true;

    // Skip blank lines — keep consuming newlines
    while (this.pos < this.source.length) {
      // Skip spaces at start of new line to measure indent
      const lineStart = this.pos;
      let indent = 0;
      while (this.pos < this.source.length && this.source[this.pos] === ' ') {
        this.pos++;
        this.col++;
        indent++;
      }
      // Handle tabs as errors
      if (this.pos < this.source.length && this.source[this.pos] === '\t') {
        this.diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: 'Tabs are not allowed; use 2-space indentation',
          span: { start: this.position(), end: this.position() },
        });
        // Treat tab as 2 spaces for recovery
        this.pos++;
        this.col++;
        indent += 2;
      }

      const ch = this.source[this.pos];
      // Blank line or comment-only line?
      if (ch === '\n' || ch === '\r' || ch === undefined) {
        if (ch === '\r' && this.source[this.pos + 1] === '\n') {
          this.pos += 2;
        } else if (ch !== undefined) {
          this.pos++;
        } else {
          break;
        }
        this.line++;
        this.col = 0;
        continue;
      }

      // Check for comment-only lines (don't affect indentation)
      if (ch === '/' && this.source[this.pos + 1] === '/') {
        // This is a comment line — don't emit indent changes,
        // let the main loop handle the comment token
        break;
      }

      // Non-blank line found — check for pending prose block
      // Must be BEFORE processIndent, because processIndent would push the
      // indent onto the stack making blockIndent == currentIndent.
      if (this.pendingProseBlock !== null && this.braceDepth === 0 &&
          indent > this.indentTracker.currentIndent) {
        this.scanProseBlock();
        return;
      }

      if (this.braceDepth === 0) {
        this.processIndent(indent);
      }
      break;
    }
  }

  private processLineStart(): void {
    let indent = 0;
    while (this.pos < this.source.length && this.source[this.pos] === ' ') {
      this.pos++;
      this.col++;
      indent++;
    }
    if (indent > 0 && this.braceDepth === 0) {
      this.processIndent(indent);
    }
    this.atLineStart = false;
  }

  private processIndent(indent: number): void {
    const result = this.indentTracker.process(indent);
    if (result === null) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `Inconsistent indentation (${indent} spaces does not match any outer level)`,
        span: { start: this.position(), end: this.position() },
      });
    } else if (result > 0) {
      for (let i = 0; i < result; i++) {
        this.emitSynthetic(TokenKind.INDENT);
      }
    } else if (result < 0) {
      for (let i = 0; i < -result; i++) {
        this.emitSynthetic(TokenKind.DEDENT);
      }
    }
    // NOTE: atLineStart is kept true here so that scanToken can detect prose blocks.
    // scanToken is responsible for setting atLineStart = false after the prose check.
  }

  // ── Prose blocks ──────────────────────────────────────

  private scanProseBlock(): void {
    // We are at the start of an indented line under a prose-block keyword.
    // The pending keyword was set by scanToken. We collect all lines
    // at the current indent level or deeper as PROSE tokens.
    const blockIndent = this.col;
    const parentIndent = this.indentTracker.currentIndent;

    // If we're not indented deeper than the parent, this isn't a block
    if (blockIndent <= parentIndent) {
      this.pendingProseBlock = null;
      this.processIndent(blockIndent);
      return;
    }

    // Process the indent for this block
    this.processIndent(blockIndent);
    this.pendingProseBlock = null;

    // Collect this line and subsequent same-or-deeper lines as PROSE
    while (this.pos < this.source.length) {
      const lineStart = this.position();
      let text = '';

      // Read until end of line
      while (this.pos < this.source.length && this.source[this.pos] !== '\n' && this.source[this.pos] !== '\r') {
        text += this.source[this.pos]!;
        this.advance();
      }

      if (text.length > 0) {
        this.tokens.push({
          kind: TokenKind.PROSE,
          text,
          span: { start: lineStart, end: this.position() },
        });
      }

      // Check if there's a next line
      if (this.pos >= this.source.length) break;

      // Consume newline
      const nlStart = this.position();
      if (this.source[this.pos] === '\r' && this.source[this.pos + 1] === '\n') {
        this.pos += 2;
      } else {
        this.pos++;
      }
      this.line++;
      this.col = 0;

      this.tokens.push({
        kind: TokenKind.NEWLINE,
        text: '\n',
        span: { start: nlStart, end: this.position() },
      });

      // Skip blank lines
      while (this.pos < this.source.length) {
        const ch = this.source[this.pos];
        if (ch === '\n') {
          this.pos++;
          this.line++;
          this.col = 0;
          continue;
        }
        if (ch === '\r') {
          if (this.source[this.pos + 1] === '\n') this.pos++;
          this.pos++;
          this.line++;
          this.col = 0;
          continue;
        }
        break;
      }

      // Measure next line's indentation
      let nextIndent = 0;
      const savedPos = this.pos;
      const savedCol = this.col;
      while (this.pos < this.source.length && this.source[this.pos] === ' ') {
        this.pos++;
        this.col++;
        nextIndent++;
      }

      // If next line is at same indent or deeper, continue collecting prose
      if (nextIndent >= blockIndent && this.pos < this.source.length &&
          this.source[this.pos] !== '\n' && this.source[this.pos] !== '\r') {
        continue;
      }

      // Otherwise, this line is at a lower indent — emit DEDENT(s) and leave
      // pos/col pointing at the first non-space char of this new line.
      // Process the indent to emit DEDENT tokens for leaving the prose block.
      if (this.braceDepth === 0) {
        this.processIndent(nextIndent);
      }
      break;
    }

    // We're at a new line start (or EOF). Let scanToken handle what's next.
    this.atLineStart = true;
  }

  // ── Comments ──────────────────────────────────────────

  private scanLineComment(): void {
    const start = this.position();
    // Skip //
    this.advance();
    this.advance();

    let text = '//';
    while (this.pos < this.source.length && this.source[this.pos] !== '\n' && this.source[this.pos] !== '\r') {
      text += this.source[this.pos]!;
      this.advance();
    }

    this.tokens.push({
      kind: TokenKind.LINE_COMMENT,
      text,
      span: { start, end: this.position() },
    });
  }

  private scanBlockComment(): void {
    const start = this.position();
    let text = '/*';
    this.advance(); // /
    this.advance(); // *

    while (this.pos < this.source.length) {
      if (this.source[this.pos] === '*' && this.source[this.pos + 1] === '/') {
        text += '*/';
        this.advance();
        this.advance();
        this.tokens.push({
          kind: TokenKind.BLOCK_COMMENT,
          text,
          span: { start, end: this.position() },
        });
        return;
      }
      if (this.source[this.pos] === '\n') {
        text += '\n';
        this.pos++;
        this.line++;
        this.col = 0;
      } else if (this.source[this.pos] === '\r') {
        if (this.source[this.pos + 1] === '\n') {
          text += '\r\n';
          this.pos += 2;
        } else {
          text += '\r';
          this.pos++;
        }
        this.line++;
        this.col = 0;
      } else {
        text += this.source[this.pos]!;
        this.advance();
      }
    }

    // Unterminated block comment
    this.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      message: 'Unterminated block comment',
      span: { start, end: this.position() },
    });
    this.tokens.push({
      kind: TokenKind.BLOCK_COMMENT,
      text,
      span: { start, end: this.position() },
    });
  }

  // ── Context lines ─────────────────────────────────────

  private isContextLinePosition(): boolean {
    // > must be followed by a space to be a context line,
    // and should appear where context lines are expected (parser decides).
    // Here we just check for "> " pattern.
    return this.peekAt(1) === ' ';
  }

  private scanContextLine(): void {
    const start = this.position();
    this.advance(); // skip >
    this.advance(); // skip space

    let text = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '\n' && this.source[this.pos] !== '\r') {
      text += this.source[this.pos]!;
      this.advance();
    }

    this.tokens.push({
      kind: TokenKind.PROSE,
      text: '> ' + text,
      span: { start, end: this.position() },
    });
  }

  // ── Strings ───────────────────────────────────────────

  private scanStringLiteral(): void {
    const start = this.position();
    this.advance(); // opening "
    let text = '"';

    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\\' && this.pos + 1 < this.source.length) {
        text += this.source[this.pos]!;
        this.advance();
        text += this.source[this.pos]!;
        this.advance();
      } else if (this.source[this.pos] === '\n' || this.source[this.pos] === '\r') {
        break; // Unterminated
      } else {
        text += this.source[this.pos]!;
        this.advance();
      }
    }

    if (this.pos < this.source.length && this.source[this.pos] === '"') {
      text += '"';
      this.advance();
    } else {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: 'Unterminated string literal',
        span: { start, end: this.position() },
      });
    }

    this.tokens.push({
      kind: TokenKind.STRING_LITERAL,
      text,
      span: { start, end: this.position() },
    });
  }

  // ── Numbers & Durations ───────────────────────────────

  private scanNumber(): void {
    const start = this.position();
    let text = '';

    // Optional minus
    if (this.source[this.pos] === '-') {
      text += '-';
      this.advance();
    }

    // Integer part
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos]!)) {
      text += this.source[this.pos]!;
      this.advance();
    }

    // Check for duration suffix: s, m, h, d
    if (this.pos < this.source.length && 'smhd'.includes(this.source[this.pos]!) && !this.isAlpha(this.peekAt(1))) {
      text += this.source[this.pos]!;
      this.advance();
      this.tokens.push({
        kind: TokenKind.DURATION,
        text,
        span: { start, end: this.position() },
      });
      return;
    }

    // Check for float: .digits
    if (this.source[this.pos] === '.' && this.isDigit(this.peekAt(1))) {
      text += '.';
      this.advance();
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos]!)) {
        text += this.source[this.pos]!;
        this.advance();
      }
      this.tokens.push({
        kind: TokenKind.FLOAT_LITERAL,
        text,
        span: { start, end: this.position() },
      });
      return;
    }

    this.tokens.push({
      kind: TokenKind.INT_LITERAL,
      text,
      span: { start, end: this.position() },
    });
  }

  // ── Words (identifiers, keywords, type names) ─────────

  private scanWord(): void {
    const start = this.position();
    let text = '';

    while (this.pos < this.source.length && (this.isAlphaNumeric(this.source[this.pos]!) || this.source[this.pos] === '_')) {
      text += this.source[this.pos]!;
      this.advance();
    }

    // Check for HTTP methods (all uppercase, short)
    const httpKind = HTTP_METHODS.get(text);
    if (httpKind) {
      this.tokens.push({
        kind: httpKind,
        text,
        span: { start, end: this.position() },
      });
      return;
    }

    // Check for keywords
    const kwKind = KEYWORDS.get(text);
    if (kwKind) {
      const token: Token = {
        kind: kwKind,
        text,
        span: { start, end: this.position() },
      };
      this.tokens.push(token);

      // If this is a prose-block keyword and the next non-space char is `:`
      // followed by indent (or inline prose), mark for prose collection
      if (PROSE_BLOCK_KEYWORDS.has(kwKind)) {
        this.markPendingProseBlock(kwKind);
      }
      return;
    }

    // Check for kit keywords
    if (this.kitKeywords.has(text)) {
      this.tokens.push({
        kind: TokenKind.KIT_KEYWORD,
        text,
        span: { start, end: this.position() },
      });
      return;
    }

    // Determine identifier type from casing
    let kind: TokenKind;
    if (text === text.toUpperCase() && text.length > 1 && text.includes('_')) {
      // ALL_CAPS_WITH_UNDERSCORES → constant
      kind = TokenKind.UPPER_IDENTIFIER;
    } else if (text[0]! >= 'A' && text[0]! <= 'Z') {
      // PascalCase → type name
      kind = TokenKind.TYPE_NAME;
    } else {
      kind = TokenKind.IDENTIFIER;
    }

    this.tokens.push({
      kind,
      text,
      span: { start, end: this.position() },
    });
  }

  private markPendingProseBlock(kwKind: TokenKind): void {
    // Peek ahead past whitespace to see if there's a `:` followed by NEWLINE
    // (block form) or `:` followed by content (inline form)
    let lookAhead = this.pos;
    while (lookAhead < this.source.length && this.source[lookAhead] === ' ') {
      lookAhead++;
    }
    // The colon will be consumed by the main loop next, but we set the flag
    // so that after the colon + newline, we switch to prose collection mode.
    this.pendingProseBlock = kwKind;
  }

  // ── Route paths ───────────────────────────────────────

  private isRoutePathStart(): boolean {
    // Look at the most recent non-trivia token to see if it's after:
    // 1. An HTTP method (route: GET /path)
    // 2. A colon after 'route' keyword (route: /path for kit constructs)
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const t = this.tokens[i]!;
      if (t.kind === TokenKind.NEWLINE || t.kind === TokenKind.LINE_COMMENT ||
          t.kind === TokenKind.BLOCK_COMMENT) continue;
      // After HTTP method, expect a path
      if (t.kind === TokenKind.KW_GET || t.kind === TokenKind.KW_POST ||
          t.kind === TokenKind.KW_PUT || t.kind === TokenKind.KW_PATCH ||
          t.kind === TokenKind.KW_DELETE) return true;
      // After route: (colon), the next / starts a path
      if (t.kind === TokenKind.COLON) {
        // Check the token before the colon is 'route'
        for (let j = i - 1; j >= 0; j--) {
          const prev = this.tokens[j]!;
          if (prev.kind === TokenKind.NEWLINE || prev.kind === TokenKind.LINE_COMMENT) continue;
          if (prev.kind === TokenKind.KW_ROUTE) return true;
          break;
        }
      }
      break;
    }
    return false;
  }

  private scanPath(): void {
    const start = this.position();
    let text = '';

    // Consume /segments/:params/etc
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos]!;
      if (ch === '/' || ch === ':' || ch === '_' || ch === '-' ||
          this.isAlphaNumeric(ch)) {
        text += ch;
        this.advance();
      } else {
        break;
      }
    }

    this.tokens.push({
      kind: TokenKind.PATH,
      text,
      span: { start, end: this.position() },
    });
  }

  // ── Helpers ───────────────────────────────────────────

  private peek(): string {
    return this.source[this.pos] ?? '\0';
  }

  private peekAt(offset: number): string {
    return this.source[this.pos + offset] ?? '\0';
  }

  private advance(): void {
    this.pos++;
    this.col++;
  }

  private position(): Position {
    return { line: this.line, column: this.col, offset: this.pos };
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  private emit1(kind: TokenKind): void {
    const start = this.position();
    const text = this.source[this.pos]!;
    this.advance();
    this.tokens.push({ kind, text, span: { start, end: this.position() } });
  }

  private emit2(kind: TokenKind): void {
    const start = this.position();
    const text = this.source.slice(this.pos, this.pos + 2);
    this.advance();
    this.advance();
    this.tokens.push({ kind, text, span: { start, end: this.position() } });
  }

  private emit3(kind: TokenKind): void {
    const start = this.position();
    const text = this.source.slice(this.pos, this.pos + 3);
    this.advance();
    this.advance();
    this.advance();
    this.tokens.push({ kind, text, span: { start, end: this.position() } });
  }

  private emitSynthetic(kind: TokenKind): void {
    const pos = this.position();
    this.tokens.push({ kind, text: '', span: { start: pos, end: pos } });
  }
}
