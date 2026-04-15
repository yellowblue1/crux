import { execAsync, execOrThrowAsync, shellEscape } from "../../shared/exec.js";
import type { GitAdapter, WorktreeCreateResult } from "../domain/ports.js";

export function createGitWorktreeAdapter(): GitAdapter {
  return {
    async createWorktree(
      branch: string,
      fromRef?: string,
      noFetch?: boolean,
    ): Promise<WorktreeCreateResult> {
      const fromFlag = fromRef ? ` --from ${shellEscape(fromRef)}` : "";
      const noFetchFlag = noFetch ? " --no-fetch" : "";
      const command = `git gtr new ${shellEscape(branch)}${fromFlag}${noFetchFlag}`;
      const result = await execAsync(command);
      if (result.success) {
        return { success: true };
      }
      return { success: false, error: result.error || `Failed to create worktree: ${branch}` };
    },
    async getWorktreePath(branch: string): Promise<string> {
      return execOrThrowAsync(`git gtr go ${shellEscape(branch)}`);
    },
  };
}
