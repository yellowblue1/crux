import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createFileTeamRepository } from "../../team/infrastructure/file-team-repository.js";
import { startSession } from "../../worktree/application/start-session.js";
import type { StartWorktreeSessionArgs } from "../../worktree/domain/types.js";
import { createClaudeConfigAdapter } from "../../worktree/infrastructure/claude-config-adapter.js";
import { createGitWorktreeAdapter } from "../../worktree/infrastructure/git-worktree-adapter.js";
import { createTmuxAdapter } from "../../worktree/infrastructure/tmux-adapter.js";

export type { StartWorktreeSessionArgs };

/**
 * Creates a git worktree and starts Claude Code in a new tmux window.
 * Composition root: wires infrastructure and maps domain result to MCP type.
 */
export async function startWorktreeSession(
  args: StartWorktreeSessionArgs,
): Promise<CallToolResult> {
  const result = await startSession(args, {
    git: createGitWorktreeAdapter(),
    tmux: createTmuxAdapter(),
    config: createClaudeConfigAdapter(),
    teamRepo: createFileTeamRepository(),
    cwd: process.cwd(),
  });

  if (result.success) {
    return {
      content: [{ type: "text", text: `Started Claude Code in worktree: ${result.worktreePath}` }],
    };
  }

  return {
    content: [{ type: "text", text: `Error: ${result.error}` }],
    isError: true,
  };
}
