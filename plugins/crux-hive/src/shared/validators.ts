/**
 * Validates a team or agent name against safe characters.
 * Allows alphanumeric, hyphens, and underscores only.
 * This prevents path traversal via characters like '/' or '..'.
 */
export function isValidName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}
