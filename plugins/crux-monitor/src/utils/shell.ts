/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 */
export function shellEscape(str: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}
