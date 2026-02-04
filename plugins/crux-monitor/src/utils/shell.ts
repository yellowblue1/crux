/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 *
 * NOTE: This function is intentionally duplicated in crux-hive/src/mcp/utils/exec.ts
 * to maintain plugin independence. Each plugin should be usable standalone without
 * cross-plugin dependencies.
 */
export function shellEscape(str: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}
