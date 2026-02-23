import { lex } from '@gist-lang/parser';
import type { Token } from '@gist-lang/parser';

export interface FormatOptions {
  /** Indent width in spaces. Default: 2 */
  indentWidth?: number;
  /** Ensure trailing newline. Default: true */
  trailingNewline?: boolean;
  /** Maximum consecutive blank lines. Default: 1 */
  maxBlankLines?: number;
  /** Insert blank line between top-level declarations. Default: true */
  blankLineBetweenDeclarations?: boolean;
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
  indentWidth: 2,
  trailingNewline: true,
  maxBlankLines: 1,
  blankLineBetweenDeclarations: true,
};

/**
 * Format a GIST source string.
 *
 * The formatter normalizes:
 * - Indentation (consistent 2-space multiples)
 * - Trailing whitespace
 * - Consecutive blank lines (max 1)
 * - Blank lines between top-level declarations
 * - Spacing around operators (: = -> |)
 * - Trailing newline
 */
export function format(source: string, options?: FormatOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = source.split('\n');
  const result: string[] = [];

  let consecutiveBlankLines = 0;
  let prevLineType: LineType = 'blank';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimEnd();

    // Blank line handling
    if (trimmed === '') {
      consecutiveBlankLines++;
      if (consecutiveBlankLines <= opts.maxBlankLines) {
        result.push('');
      }
      prevLineType = 'blank';
      continue;
    }

    consecutiveBlankLines = 0;

    // Determine indentation level
    const indent = measureIndent(raw);
    const content = trimmed.trimStart();
    const normalizedIndent = normalizeIndent(indent, opts.indentWidth);

    // Detect line type for blank-line insertion
    const lineType = classifyLine(content, normalizedIndent);

    // Insert blank line between top-level declarations if needed
    if (opts.blankLineBetweenDeclarations && normalizedIndent === 0) {
      if (prevLineType !== 'blank' && prevLineType !== 'comment' &&
          isTopLevelDeclarationStart(content) && result.length > 0) {
        // Ensure blank line before top-level declaration
        if (result[result.length - 1] !== '') {
          result.push('');
        }
      }
    }

    // Format the line content
    const formatted = formatLineContent(content, normalizedIndent, opts);
    const indentStr = ' '.repeat(normalizedIndent);
    result.push(indentStr + formatted);
    prevLineType = lineType;
  }

  // Remove trailing blank lines (we'll add one back if needed)
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }

  let output = result.join('\n');
  if (opts.trailingNewline && output.length > 0) {
    output += '\n';
  }

  return output;
}

// ─── Line classification ─────────────────────────────────

type LineType = 'blank' | 'comment' | 'declaration' | 'body';

function classifyLine(content: string, indent: number): LineType {
  if (content === '') return 'blank';
  if (content.startsWith('//')) return 'comment';
  if (indent === 0) return 'declaration';
  return 'body';
}

function isTopLevelDeclarationStart(content: string): boolean {
  // Model: Name = {, Name = value | value, Name = error {
  if (/^[A-Z]\w*\s*=/.test(content)) return true;
  // CONSTANT = value
  if (/^[A-Z_][A-Z0-9_]+\s*=/.test(content)) return true;
  // module name
  if (content.startsWith('module ')) return true;
  // trait Name
  if (content.startsWith('trait ')) return true;
  // type Name
  if (content.startsWith('type ')) return true;
  // state Name
  if (content.startsWith('state ')) return true;
  // project name
  if (content.startsWith('project ')) return true;
  // test name
  if (content.startsWith('test ')) return true;
  // use / extend
  if (content.startsWith('use ') || content.startsWith('extend ')) return true;
  // Section comments
  if (content.startsWith('// ───')) return true;
  return false;
}

// ─── Indentation ─────────────────────────────────────────

function measureIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else if (ch === '\t') count += 2; // Treat tab as 2 spaces
    else break;
  }
  return count;
}

function normalizeIndent(measured: number, width: number): number {
  // Round to nearest multiple of indent width
  return Math.round(measured / width) * width;
}

// ─── Line content formatting ─────────────────────────────

function formatLineContent(content: string, indent: number, opts: Required<FormatOptions>): string {
  // Don't format comments
  if (content.startsWith('//')) {
    return content;
  }

  // Don't format string literals or prose lines (indented content under do:, must:, etc.)
  // Prose lines are typically body text at indent >= 4 that aren't keywords
  if (isProseContent(content, indent)) {
    return content;
  }

  let result = content;

  // Normalize spacing around ':'  (but not in route paths like /users/:id)
  result = normalizeColonSpacing(result);

  // Normalize spacing around '='
  result = normalizeEqualsSpacing(result);

  // Normalize spacing around '->'
  result = normalizeArrowSpacing(result);

  // Normalize spacing around '|'
  result = normalizePipeSpacing(result);

  // Normalize comma spacing
  result = normalizeCommaSpacing(result);

  // Collapse multiple spaces (except leading)
  result = collapseInternalSpaces(result);

  // Trim any accidental leading/trailing whitespace from normalization
  // (indent is handled separately by the caller)
  return result.trim();
}

/**
 * Determine if a line is prose content (freeform text in do:/must:/etc. blocks).
 */
function isProseContent(content: string, indent: number): boolean {
  // Prose is at indent level >= 3 (6+ spaces) and doesn't start with a keyword
  if (indent < 6) return false;

  // Check if it starts with a keyword that would be at this indent level
  const keywordPattern = /^(to|fn|flow|on|route:|saves:|emits:|do:|code:|must:|ensure:|eg:|fails:|guard:|uses:|socket:|schedule:|public|async|trace|stage|compensate:|given:|call|trigger|then|expect:|as|in)\b/;
  if (keywordPattern.test(content)) return false;

  return true;
}

// ─── Spacing normalizers ─────────────────────────────────

function normalizeColonSpacing(line: string): string {
  // Handle keyword colons (e.g., "route:", "saves:", "do:")
  // Rule: no space before ':', one space after ':' when followed by content
  // But preserve route paths like /users/:id
  // And preserve standalone keyword colons at end of line (do:, saves:, etc.)
  return line.replace(/(\w)\s*:\s*(?=\S)/g, (match, pre, offset) => {
    // Check if this is inside a route path (preceded by /)
    if (offset > 0 && line[offset - 1] === '/') return match;
    return `${pre}: `;
  });
}

function normalizeEqualsSpacing(line: string): string {
  // "Name = {" or "Name = value" — ensure space around =
  // But don't add leading space if = is at start of content
  return line
    .replace(/(\S)\s*=\s*/g, '$1 = ')    // space around = when preceded by non-space
    .replace(/^=\s*/, '= ');              // normalize space after = at start of line
}

function normalizeArrowSpacing(line: string): string {
  // "x -> Type" — ensure space around ->
  // But don't add leading space if -> is at start of content (continuation lines)
  return line
    .replace(/(\S)\s*->\s*/g, '$1 -> ')  // space before -> when preceded by non-space
    .replace(/^->\s*/, '-> ');            // normalize space after -> at start of line
}

function normalizePipeSpacing(line: string): string {
  // "a | b" — ensure space around |
  // But don't add leading space if | is at start of content
  return line
    .replace(/(\S)\s*\|\s*/g, '$1 | ')   // space around | when preceded by non-space
    .replace(/^\|\s*/, '| ');              // normalize space after | at start of line
}

function normalizeCommaSpacing(line: string): string {
  // "a, b" — no space before comma, one space after (except end of line)
  return line.replace(/\s*,\s*/g, ', ').replace(/,\s*$/, ',');
}

function collapseInternalSpaces(line: string): string {
  // Collapse runs of multiple spaces to single space (preserving strings)
  // Simple approach: only collapse spaces not inside quotes
  const parts: string[] = [];
  let inString = false;
  let i = 0;

  while (i < line.length) {
    if (line[i] === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inString = !inString;
      parts.push(line[i]);
      i++;
    } else if (!inString && line[i] === ' ' && i + 1 < line.length && line[i + 1] === ' ') {
      // Collapse spaces, but keep at least one
      parts.push(' ');
      while (i < line.length && line[i] === ' ') i++;
    } else {
      parts.push(line[i]);
      i++;
    }
  }

  return parts.join('');
}
