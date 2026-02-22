/** Zero-based position in source text. */
export interface Position {
  /** Zero-based line number. */
  line: number;
  /** Zero-based column (character offset within line). */
  column: number;
  /** Absolute character offset from start of file. */
  offset: number;
}

/** A contiguous range in source text. */
export interface TextSpan {
  start: Position;
  end: Position;
}

export function emptySpan(): TextSpan {
  const zero: Position = { line: 0, column: 0, offset: 0 };
  return { start: zero, end: zero };
}

export function mergeSpans(a: TextSpan, b: TextSpan): TextSpan {
  return { start: a.start, end: b.end };
}
