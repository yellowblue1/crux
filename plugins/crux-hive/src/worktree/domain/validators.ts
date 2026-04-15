/**
 * Validates a git branch name or ref against safe characters.
 * Allows alphanumeric, slashes, hyphens, underscores, and dots.
 * This prevents command injection via shell metacharacters.
 */
export function isValidGitRef(ref: string): boolean {
  const safeRefPattern = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;
  if (!safeRefPattern.test(ref)) {
    return false;
  }
  if (ref.includes("..") || ref.endsWith(".lock") || ref.includes("@{")) {
    return false;
  }
  return true;
}

/**
 * Validates a team or agent name against safe characters.
 * Allows alphanumeric, hyphens, and underscores only.
 * This prevents path traversal via characters like '/' or '..'.
 */
export function isValidName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}
