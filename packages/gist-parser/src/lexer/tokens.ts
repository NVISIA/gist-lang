import type { TextSpan } from '../common/source-location.js';

/**
 * All token kinds recognized by the GIST lexer.
 * Derived from spec/gist-grammar.md sections 1-20.
 */
export enum TokenKind {
  // ── Structural ──────────────────────────────────────────
  INDENT = 'INDENT',
  DEDENT = 'DEDENT',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',

  // ── Delimiters ──────────────────────────────────────────
  OPEN_PAREN = 'OPEN_PAREN',       // (
  CLOSE_PAREN = 'CLOSE_PAREN',     // )
  OPEN_BRACE = 'OPEN_BRACE',       // {
  CLOSE_BRACE = 'CLOSE_BRACE',     // }
  OPEN_BRACKET = 'OPEN_BRACKET',   // [
  CLOSE_BRACKET = 'CLOSE_BRACKET', // ]
  COMMA = 'COMMA',                 // ,
  COLON = 'COLON',                 // :
  SEMICOLON = 'SEMICOLON',         // ;
  DOT = 'DOT',                     // .
  ARROW = 'ARROW',                 // ->
  PIPE = 'PIPE',                   // |
  EQUALS = 'EQUALS',               // =
  QUESTION = 'QUESTION',           // ?
  SPREAD = 'SPREAD',               // ...
  GT = 'GT',                       // >
  HASH = 'HASH',                   // #
  SLASH = 'SLASH',                 // /

  // ── Keywords: Structure ─────────────────────────────────
  KW_PROJECT = 'KW_PROJECT',       // project
  KW_MODULE = 'KW_MODULE',         // module
  KW_KIT = 'KW_KIT',               // kit (followed by :)
  KW_STACK = 'KW_STACK',           // stack (followed by :)
  KW_STYLE = 'KW_STYLE',           // style (followed by :)
  KW_RULES = 'KW_RULES',           // rules
  KW_ALWAYS = 'KW_ALWAYS',         // always (followed by :)
  KW_ACROSS = 'KW_ACROSS',         // across
  KW_BEFORE = 'KW_BEFORE',         // before (followed by :)
  KW_AFTER = 'KW_AFTER',           // after (followed by :)

  // ── Keywords: Types & Data ──────────────────────────────
  KW_TYPE = 'KW_TYPE',             // type
  KW_TRAIT = 'KW_TRAIT',           // trait
  KW_STATE = 'KW_STATE',           // state
  KW_FOR = 'KW_FOR',               // for
  KW_ERROR = 'KW_ERROR',           // error
  KW_EPHEMERAL = 'KW_EPHEMERAL',   // ephemeral
  KW_IMMUTABLE = 'KW_IMMUTABLE',   // immutable

  // ── Keywords: Declarations ──────────────────────────────
  KW_TO = 'KW_TO',                 // to
  KW_FN = 'KW_FN',                 // fn
  KW_FLOW = 'KW_FLOW',             // flow
  KW_ON = 'KW_ON',                 // on
  KW_TEST = 'KW_TEST',             // test

  // ── Keywords: Intent Metadata ───────────────────────────
  KW_NEEDS = 'KW_NEEDS',           // needs (followed by :)
  KW_SAVES = 'KW_SAVES',           // saves (followed by :)
  KW_EMITS = 'KW_EMITS',           // emits (followed by :)
  KW_ROUTE = 'KW_ROUTE',           // route (followed by :)
  KW_SOCKET = 'KW_SOCKET',         // socket (followed by :)
  KW_GUARD = 'KW_GUARD',           // guard (followed by :)
  KW_USES = 'KW_USES',             // uses (followed by :)
  KW_SCHEDULE = 'KW_SCHEDULE',     // schedule (followed by :)
  KW_PUBLIC = 'KW_PUBLIC',         // public
  KW_ASYNC = 'KW_ASYNC',           // async
  KW_TRACE = 'KW_TRACE',           // trace

  // ── Keywords: Behavior ──────────────────────────────────
  KW_DO = 'KW_DO',                 // do (followed by :)
  KW_CODE = 'KW_CODE',             // code (followed by :)
  KW_MUST = 'KW_MUST',             // must (followed by : or used in tests)
  KW_ENSURE = 'KW_ENSURE',         // ensure (followed by :)
  KW_EG = 'KW_EG',                 // eg (followed by :)
  KW_FAILS = 'KW_FAILS',           // fails (followed by :)
  KW_STAGE = 'KW_STAGE',           // stage
  KW_COMPENSATE = 'KW_COMPENSATE', // compensate (followed by :)
  KW_WHEN = 'KW_WHEN',             // when

  // ── Keywords: Tests ─────────────────────────────────────
  KW_GIVEN = 'KW_GIVEN',           // given (followed by :)
  KW_CALL = 'KW_CALL',             // call
  KW_TRIGGER = 'KW_TRIGGER',       // trigger
  KW_THEN = 'KW_THEN',             // then
  KW_EXPECT = 'KW_EXPECT',         // expect (followed by : or 'after' or 'client')
  KW_AS = 'KW_AS',                 // as
  KW_IN = 'KW_IN',                 // in

  // ── Keywords: Modifiers ─────────────────────────────────
  KW_GENERATED = 'KW_GENERATED',   // generated
  KW_UNIQUE = 'KW_UNIQUE',         // unique
  KW_SECRET = 'KW_SECRET',         // secret
  KW_COMPUTED = 'KW_COMPUTED',     // computed
  KW_RETAIN = 'KW_RETAIN',         // retain (followed by :)
  KW_TTL = 'KW_TTL',               // ttl (followed by :)

  // ── Keywords: HTTP Methods ──────────────────────────────
  KW_GET = 'KW_GET',               // GET
  KW_POST = 'KW_POST',             // POST
  KW_PUT = 'KW_PUT',               // PUT
  KW_PATCH = 'KW_PATCH',           // PATCH
  KW_DELETE = 'KW_DELETE',         // DELETE

  // ── Keywords: Primitive Types ───────────────────────────
  KW_STRING = 'KW_STRING',         // string
  KW_INT = 'KW_INT',               // int
  KW_FLOAT = 'KW_FLOAT',           // float
  KW_DECIMAL = 'KW_DECIMAL',       // decimal
  KW_NUMBER = 'KW_NUMBER',         // number
  KW_BOOL = 'KW_BOOL',             // bool
  KW_DATE = 'KW_DATE',             // date
  KW_DATETIME = 'KW_DATETIME',     // datetime
  KW_BYTES = 'KW_BYTES',           // bytes
  KW_ANY = 'KW_ANY',               // any
  KW_VOID = 'KW_VOID',             // void

  // ── Keywords: Generic Types ─────────────────────────────
  KW_RESULT = 'KW_RESULT',         // result
  KW_MAP = 'KW_MAP',               // map

  // ── Keywords: Composition ───────────────────────────────
  KW_USE = 'KW_USE',               // use
  KW_EXTEND = 'KW_EXTEND',         // extend
  KW_REFINE = 'KW_REFINE',         // refine
  KW_PASS = 'KW_PASS',             // pass

  // ── Keywords: Scheduling ────────────────────────────────
  KW_EVERY = 'KW_EVERY',           // every
  KW_FIRST = 'KW_FIRST',           // first
  KW_CRON = 'KW_CRON',             // cron (followed by :)

  // ── Keywords: Literals ──────────────────────────────────
  KW_TRUE = 'KW_TRUE',             // true
  KW_FALSE = 'KW_FALSE',           // false
  KW_NULL = 'KW_NULL',             // null
  KW_UNLIMITED = 'KW_UNLIMITED',   // unlimited
  KW_NOW = 'KW_NOW',               // now
  KW_FOREVER = 'KW_FOREVER',       // forever

  // ── Keywords: State Hooks ───────────────────────────────
  KW_ENTER = 'KW_ENTER',           // enter
  KW_WHILE = 'KW_WHILE',           // while

  // ── Keywords: Misc ──────────────────────────────────────
  KW_FAIL = 'KW_FAIL',             // fail (in "must fail:")
  KW_CLIENT = 'KW_CLIENT',         // client (in "expect client X receives:")
  KW_RECEIVES = 'KW_RECEIVES',     // receives (in "expect client X receives:")

  // ── Identifiers & Literals ──────────────────────────────
  IDENTIFIER = 'IDENTIFIER',       // snake_case identifiers
  TYPE_NAME = 'TYPE_NAME',         // PascalCase type names
  UPPER_IDENTIFIER = 'UPPER_IDENTIFIER', // ALL_CAPS constants
  STRING_LITERAL = 'STRING_LITERAL',     // "double-quoted"
  INT_LITERAL = 'INT_LITERAL',          // 42, -3
  FLOAT_LITERAL = 'FLOAT_LITERAL',      // 3.14, -0.5
  DURATION = 'DURATION',                // 30s, 5m, 2h, 7d

  // ── Comments ────────────────────────────────────────────
  LINE_COMMENT = 'LINE_COMMENT',   // // ...
  BLOCK_COMMENT = 'BLOCK_COMMENT', // /* ... */

  // ── Prose & Context ─────────────────────────────────────
  PROSE = 'PROSE',                 // Freeform text in behavior blocks
  PATH = 'PATH',                   // /foo/:bar/baz (route paths)

  // ── Kit ─────────────────────────────────────────────────
  KIT_KEYWORD = 'KIT_KEYWORD',     // Dynamically recognized kit keywords

  // ── Error ───────────────────────────────────────────────
  ERROR_TOKEN = 'ERROR_TOKEN',     // Unrecognized character
}

export interface Token {
  kind: TokenKind;
  text: string;
  span: TextSpan;
}

/** Map of keyword strings to their token kinds. */
export const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map([
  // Structure
  ['project', TokenKind.KW_PROJECT],
  ['module', TokenKind.KW_MODULE],
  ['kit', TokenKind.KW_KIT],
  ['stack', TokenKind.KW_STACK],
  ['style', TokenKind.KW_STYLE],
  ['rules', TokenKind.KW_RULES],
  ['always', TokenKind.KW_ALWAYS],
  ['across', TokenKind.KW_ACROSS],
  ['before', TokenKind.KW_BEFORE],
  ['after', TokenKind.KW_AFTER],

  // Types & Data
  ['type', TokenKind.KW_TYPE],
  ['trait', TokenKind.KW_TRAIT],
  ['state', TokenKind.KW_STATE],
  ['for', TokenKind.KW_FOR],
  ['error', TokenKind.KW_ERROR],
  ['ephemeral', TokenKind.KW_EPHEMERAL],
  ['immutable', TokenKind.KW_IMMUTABLE],

  // Declarations
  ['to', TokenKind.KW_TO],
  ['fn', TokenKind.KW_FN],
  ['flow', TokenKind.KW_FLOW],
  ['on', TokenKind.KW_ON],
  ['test', TokenKind.KW_TEST],

  // Intent Metadata
  ['needs', TokenKind.KW_NEEDS],
  ['saves', TokenKind.KW_SAVES],
  ['emits', TokenKind.KW_EMITS],
  ['route', TokenKind.KW_ROUTE],
  ['socket', TokenKind.KW_SOCKET],
  ['guard', TokenKind.KW_GUARD],
  ['uses', TokenKind.KW_USES],
  ['schedule', TokenKind.KW_SCHEDULE],
  ['public', TokenKind.KW_PUBLIC],
  ['async', TokenKind.KW_ASYNC],
  ['trace', TokenKind.KW_TRACE],

  // Behavior
  ['do', TokenKind.KW_DO],
  ['code', TokenKind.KW_CODE],
  ['must', TokenKind.KW_MUST],
  ['ensure', TokenKind.KW_ENSURE],
  ['eg', TokenKind.KW_EG],
  ['fails', TokenKind.KW_FAILS],
  ['stage', TokenKind.KW_STAGE],
  ['compensate', TokenKind.KW_COMPENSATE],
  ['when', TokenKind.KW_WHEN],

  // Tests
  ['given', TokenKind.KW_GIVEN],
  ['call', TokenKind.KW_CALL],
  ['trigger', TokenKind.KW_TRIGGER],
  ['then', TokenKind.KW_THEN],
  ['expect', TokenKind.KW_EXPECT],
  ['as', TokenKind.KW_AS],
  ['in', TokenKind.KW_IN],

  // Modifiers
  ['generated', TokenKind.KW_GENERATED],
  ['unique', TokenKind.KW_UNIQUE],
  ['secret', TokenKind.KW_SECRET],
  ['computed', TokenKind.KW_COMPUTED],
  ['retain', TokenKind.KW_RETAIN],
  ['ttl', TokenKind.KW_TTL],

  // Primitive Types
  ['string', TokenKind.KW_STRING],
  ['int', TokenKind.KW_INT],
  ['float', TokenKind.KW_FLOAT],
  ['decimal', TokenKind.KW_DECIMAL],
  ['number', TokenKind.KW_NUMBER],
  ['bool', TokenKind.KW_BOOL],
  ['date', TokenKind.KW_DATE],
  ['datetime', TokenKind.KW_DATETIME],
  ['bytes', TokenKind.KW_BYTES],
  ['any', TokenKind.KW_ANY],
  ['void', TokenKind.KW_VOID],

  // Generic Types
  ['result', TokenKind.KW_RESULT],
  ['map', TokenKind.KW_MAP],

  // Composition
  ['use', TokenKind.KW_USE],
  ['extend', TokenKind.KW_EXTEND],
  ['refine', TokenKind.KW_REFINE],
  ['pass', TokenKind.KW_PASS],

  // Scheduling
  ['every', TokenKind.KW_EVERY],
  ['first', TokenKind.KW_FIRST],
  ['cron', TokenKind.KW_CRON],

  // Literals
  ['true', TokenKind.KW_TRUE],
  ['false', TokenKind.KW_FALSE],
  ['null', TokenKind.KW_NULL],
  ['unlimited', TokenKind.KW_UNLIMITED],
  ['now', TokenKind.KW_NOW],
  ['forever', TokenKind.KW_FOREVER],

  // State Hooks
  ['enter', TokenKind.KW_ENTER],
  ['while', TokenKind.KW_WHILE],

  // Misc
  ['fail', TokenKind.KW_FAIL],
  ['client', TokenKind.KW_CLIENT],
  ['receives', TokenKind.KW_RECEIVES],
]);

/** HTTP method keywords (uppercase). */
export const HTTP_METHODS: ReadonlyMap<string, TokenKind> = new Map([
  ['GET', TokenKind.KW_GET],
  ['POST', TokenKind.KW_POST],
  ['PUT', TokenKind.KW_PUT],
  ['PATCH', TokenKind.KW_PATCH],
  ['DELETE', TokenKind.KW_DELETE],
]);

/**
 * Keywords that introduce prose/behavior blocks when followed by `:`.
 * After these, indented content is collected as PROSE tokens.
 */
export const PROSE_BLOCK_KEYWORDS = new Set<TokenKind>([
  TokenKind.KW_DO,
  TokenKind.KW_CODE,
  TokenKind.KW_MUST,
  TokenKind.KW_ENSURE,
  TokenKind.KW_EG,
  TokenKind.KW_FAILS,
  TokenKind.KW_GIVEN,
  TokenKind.KW_EXPECT,
  TokenKind.KW_STYLE,
  TokenKind.KW_BEFORE,
  TokenKind.KW_AFTER,
  TokenKind.KW_COMPENSATE,
  TokenKind.KW_GUARD,
]);
