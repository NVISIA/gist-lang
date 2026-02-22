/**
 * Tracks indentation levels using a stack, emitting
 * INDENT/DEDENT markers like Python's tokenizer.
 *
 * GIST uses 2-space indentation per the spec.
 */
export class IndentTracker {
  /** Stack of column numbers representing current indent levels. */
  private stack: number[] = [0];

  /** Current indentation level (top of stack). */
  get currentIndent(): number {
    return this.stack[this.stack.length - 1]!;
  }

  get depth(): number {
    return this.stack.length - 1;
  }

  /**
   * Process a new line's indentation and return the transitions needed.
   * @param indent - The number of leading spaces on the new line.
   * @returns Positive number = that many INDENTs; negative = that many DEDENTs; 0 = same level.
   *          Returns `null` if the indent doesn't match any level on the stack (error).
   */
  process(indent: number): number | null {
    const current = this.currentIndent;

    if (indent > current) {
      // Indent: push new level
      this.stack.push(indent);
      return 1;
    }

    if (indent === current) {
      return 0;
    }

    // Dedent: pop levels until we find a match
    let dedentCount = 0;
    while (this.stack.length > 1 && this.stack[this.stack.length - 1]! > indent) {
      this.stack.pop();
      dedentCount++;
    }

    if (this.stack[this.stack.length - 1] !== indent) {
      // Inconsistent indentation — no matching level on the stack.
      // Push the indent anyway to recover, but signal an error.
      this.stack.push(indent);
      return null;
    }

    return -dedentCount;
  }

  /**
   * Flush remaining indentation at end of file.
   * @returns Number of DEDENTs needed to return to column 0.
   */
  flush(): number {
    const count = this.stack.length - 1;
    this.stack = [0];
    return count;
  }

  /** Reset to initial state. */
  reset(): void {
    this.stack = [0];
  }
}
