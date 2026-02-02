import { execSync } from "node:child_process";

/**
 * Find the git repository root directory
 * @param cwd Working directory to search from (defaults to process.cwd())
 * @returns Git root path or null if not in a git repo
 */
export function findGitRoot(cwd?: string): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      cwd: cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}
