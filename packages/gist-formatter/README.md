# @gist-lang/formatter

Code formatter for [GIST](../../README.md) specification files. Normalizes indentation, spacing, blank lines, and trailing whitespace in `.gist` source files.

## Usage

### As a library

```typescript
import { format } from '@gist-lang/formatter';

const source = `
Foo={
   name:string
   age :  int
}
`;

const formatted = format(source);
// Output:
// Foo = {
//   name: string
//   age: int
// }
```

### Via the CLI

```bash
gist fmt                  # print formatted output
gist fmt --write          # format files in place
gist fmt --check          # check if files need formatting
```

### Via the LSP

The `@gist-lang/lsp` server registers `documentFormattingProvider`, enabling format-on-save in VS Code and other editors.

## Options

```typescript
interface FormatOptions {
  indentWidth?: number;                    // Indent width in spaces (default: 2)
  trailingNewline?: boolean;               // Ensure trailing newline (default: true)
  maxBlankLines?: number;                  // Maximum consecutive blank lines (default: 1)
  blankLineBetweenDeclarations?: boolean;  // Insert blank line between top-level declarations (default: true)
}
```

## Formatting Rules

- **Indentation** — normalizes to consistent multiples of the indent width (default: 2 spaces)
- **Trailing whitespace** — removed from all lines
- **Blank lines** — consecutive blank lines collapsed to at most 1; blank line inserted between top-level declarations
- **Colon spacing** — `name: type` (space after colon when followed by content; preserved at end of line for `do:`, `saves:`, etc.)
- **Equals spacing** — `Name = {` (space around `=`)
- **Arrow spacing** — `-> Type` (space around `->`)
- **Pipe spacing** — `a | b` (space around `|`)
- **Comma spacing** — `a, b` (space after comma)
- **Internal spaces** — multiple spaces collapsed to single (except inside strings)
- **Trailing newline** — ensured at end of file
- **Prose preservation** — freeform text in `do:`/`must:`/`ensure:` blocks is not reformatted
- **Comment preservation** — comments are not modified

Formatting is **idempotent** — formatting already-formatted output produces no changes.

## API

```typescript
export function format(source: string, options?: FormatOptions): string;
export type { FormatOptions };
```
