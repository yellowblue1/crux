import { exec, execOrThrow } from "../../shared/exec.js";
import type { GitAdapter, WorktreeCreateResult } from "../domain/ports.js";

export function createGitWorktreeAdapter(): GitAdapter {
  return {
    createWorktree(branch: string, fromRef?: string, noFetch?: boolean): WorktreeCreateResult {
      const fromFlag = fromRef ? ` --from "${fromRef}"` : "";
      const noFetchFlag = noFetch ? " --no-fetch" : "";
      const command = `git gtr new "${branch}"${fromFlag}${noFetchFlag}`;
      const result = exec(command);
      if (result.success) {
        return { success: true };
      }
      return { success: false, error: result.error || `Failed to create worktree: ${branch}` };
    },
    getWorktreePath(branch: string): string {
      return execOrThrow(`git gtr go "${branch}"`);
    },
  };
}
