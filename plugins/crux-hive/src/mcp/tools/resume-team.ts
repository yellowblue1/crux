import { stat } from "node:fs/promises";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getTranscriptPath } from "../../shared/paths.js";
import { createFileTeamRepository } from "../../team/infrastructure/file-team-repository.js";
import { type ResumeTeamResult, resumeTeam } from "../../worktree/application/resume-team.js";
import { createTmuxAdapter } from "../../worktree/infrastructure/tmux-adapter.js";

export interface ResumeTeamArgs {
  teamName: string;
  pluginDir?: string;
}

/**
 * Resumes all workers of a team after an instance restart.
 * Composition root: wires infrastructure and maps the domain result to MCP type.
 */
export async function resumeTeamSession(args: ResumeTeamArgs): Promise<CallToolResult> {
  const { teamName, pluginDir } = args;

  if (!teamName || typeof teamName !== "string") {
    return {
      content: [{ type: "text", text: "Error: teamName parameter is required" }],
      isError: true,
    };
  }

  const result = await resumeTeam(teamName, {
    tmux: createTmuxAdapter(),
    teamRepo: createFileTeamRepository(),
    worktreeExists: dirExists,
    transcriptExists: (cwd, sessionId) => Bun.file(getTranscriptPath(cwd, sessionId)).exists(),
    pluginDir,
  });

  if ("error" in result) {
    return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
  }

  return { content: [{ type: "text", text: formatResult(result) }] };
}

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export function formatResult(result: ResumeTeamResult): string {
  const lines: string[] = [];
  lines.push(`Resumed ${result.resumed.length} worker(s).`);
  if (result.resumed.length > 0) {
    lines.push(`  resumed: ${result.resumed.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    lines.push(`  skipped:`);
    for (const s of result.skipped) {
      lines.push(`    - ${s.name} (${s.reason})`);
    }
  }
  if (result.failed.length > 0) {
    lines.push(`  failed:`);
    for (const f of result.failed) {
      lines.push(`    - ${f.name}: ${f.error}`);
    }
  }
  return lines.join("\n");
}
