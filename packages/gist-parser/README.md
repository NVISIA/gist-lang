# @gist-lang/parser

Standalone parser for the [GIST language](../../README.md). Tokenizes, parses, and transforms `.gist` source files into a typed AST. Usable independently of the LSP server or VS Code extension.

## Installation

```bash
pnpm add @gist-lang/parser
```

## Usage

The parser provides a three-step pipeline: **lex** → **parse** → **AST**.

```typescript
import { lex, parse, cstToAst } from '@gist-lang/parser';

const source = `
User = { name: string; email: string, unique }

module auth
  to login(email: string) -> User
    route: POST /login
    do: validate credentials, return user
`;

// Step 1: Tokenize
const { tokens, diagnostics: lexErrors } = lex(source);

// Step 2: Parse into CST
const { cst, diagnostics: parseErrors } = parse(tokens);

// Step 3: Transform to typed AST
const program = cstToAst(cst);

// Access typed declarations
console.log(program.models[0].name);        // "User"
console.log(program.models[0].fields[0]);    // { name: "name", type: { base: { kind: "primitive", name: "string" } }, ... }
console.log(program.modules[0].name);        // "auth"
console.log(program.modules[0].intents[0]);  // { name: "login", params: [...], route: { method: "POST", path: "/login" }, ... }
```

### Kit Keywords

GIST supports dynamic keywords from domain kits (e.g., `page`, `component` from the web kit). Pass them to the lexer so they're recognized as `KIT_KEYWORD` tokens:

```typescript
const kitKeywords = new Set(['page', 'component', 'layout']);
const { tokens } = lex(source, { kitKeywords });
```

## API Reference

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `lex` | `(source: string, options?: LexerOptions) => LexResult` | Tokenize source into tokens with INDENT/DEDENT |
| `parse` | `(tokens: Token[]) => ParseResult` | Parse tokens into a Concrete Syntax Tree |
| `cstToAst` | `(cst: CstNode) => GistProgram` | Transform CST into a typed AST |

### Key Types

| Type | Description |
|------|-------------|
| `Token` | `{ kind: TokenKind, text: string, span: TextSpan }` |
| `TokenKind` | Enum of all token types (keywords, identifiers, literals, operators) |
| `CstNode` | Concrete syntax tree node preserving all tokens |
| `CstKind` | Enum of CST node types (one per grammar production) |
| `GistProgram` | Root AST node containing all declarations |
| `LexerOptions` | `{ kitKeywords?: ReadonlySet<string> }` |
| `LexResult` | `{ tokens: Token[], diagnostics: Diagnostic[] }` |
| `ParseResult` | `{ cst: CstNode, diagnostics: Diagnostic[] }` |
| `Diagnostic` | `{ message: string, severity: DiagnosticSeverity, span: TextSpan }` |

### AST Node Types

The AST provides typed interfaces for every GIST construct:

- **Data**: `ModelDeclaration`, `EnumDeclaration`, `TypeDeclaration`, `TraitDeclaration`, `ErrorDeclaration`, `ConstantDeclaration`
- **Behavior**: `ModuleDeclaration`, `IntentDeclaration`, `FnDeclaration`, `FlowDeclaration`, `OnHandlerNode`
- **State**: `StateMachineDeclaration`, `TransitionNode`, `StateHookNode`
- **Testing**: `TestDeclaration`, `GivenStep`, `CallStep`, `ExpectStep`, etc.
- **Kit**: `KitConstructNode`, `KitBlockNode`
- **Types**: `TypeRef`, `PrimitiveTypeRef`, `NamedTypeRef`, `ModelRefTypeRef`, `ResultTypeRef`, `MapTypeRef`, `InlineStructTypeRef`
- **Composition**: `UseNode`, `ExtendNode`, `RefineNode`

### Utilities

| Export | Description |
|--------|-------------|
| `isCstNode(child)` | Type guard: is this CST child a node (vs token)? |
| `isToken(child)` | Type guard: is this CST child a token? |
| `emptySpan()` | Create a zero-width span |
| `mergeSpans(a, b)` | Create a span covering both inputs |
| `KEYWORDS` | `ReadonlyMap<string, TokenKind>` of all keyword strings |
| `HTTP_METHODS` | `ReadonlyMap<string, TokenKind>` for GET/POST/PUT/PATCH/DELETE |
| `PROSE_BLOCK_KEYWORDS` | `Set<TokenKind>` of keywords that introduce prose blocks |
| `IndentTracker` | Indent/dedent stack for Python-style indentation |

## Architecture

```
src/
  common/
    source-location.ts   # Position, TextSpan types
    diagnostics.ts       # Diagnostic, DiagnosticSeverity
  lexer/
    tokens.ts            # TokenKind enum, Token interface, keyword maps
    indent-tracker.ts    # Indentation stack (INDENT/DEDENT emission)
    lexer.ts             # Two-phase tokenizer (raw tokens → indent resolution)
  parser/
    cst-nodes.ts         # CstKind enum, CstNode/CstChild types
    parser.ts            # Recursive descent parser (20 grammar productions)
  ast/
    ast-nodes.ts         # Typed AST interfaces for all GIST constructs
    cst-to-ast.ts        # CST → AST transformation
  index.ts               # Public API exports
```

The lexer handles GIST-specific challenges: indent-based blocks, brace-delimited inline syntax (suppresses INDENT/DEDENT inside `{}`), prose mode after keywords like `do:` and `must:`, and dynamic kit keyword recognition.

The parser is a hand-written recursive descent parser implementing all 20 productions from the [GIST grammar](../../spec/GIST-grammar.md). It produces a CST that preserves every token for IDE features, then `cstToAst` extracts a clean typed AST for semantic analysis.
