/**
 * The answer a shell script gave on its last line.
 *
 * `scripts/upgrade.sh` prints whatever its tools print and ends with one line
 * of JSON, such as `{"ok":true,"changed":"launcher"}`. Returns that line
 * parsed, or undefined when the last line is not JSON. What an unreadable
 * answer means is the caller's decision.
 */
export function parseLastLine(output: string): unknown {
  const lastLine = output.trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(lastLine);
  } catch {
    return undefined;
  }
}

/** The same, when the caller needs an object with named fields, or `fallback` when the script gave none. */
export function parseLastLineObject(output: string, fallback: Record<string, unknown>): Record<string, unknown> {
  const result = parseLastLine(output);
  return typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : fallback;
}
