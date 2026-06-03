import { stat } from "node:fs/promises";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getProjectsDir } from "../../shared/paths.js";
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
    transcriptExists,
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

/**
 * A transcript lives at ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl.
 * Globbing by the unique session UUID avoids reimplementing the CLI's cwd
 * encoding, so resume keeps working if that encoding ever changes.
 */
async function transcriptExists(sessionId: string): Promise<boolean> {
  const glob = new Bun.Glob(`*/${sessionId}.jsonl`);
  for await (const _ of glob.scan({ cwd: getProjectsDir(), onlyFiles: true })) {
    return true;
  }
  return false;
}

export function formatResult(result: ResumeTeamResult): string {
  const section = (label: string, items: string[]): string[] =>
    items.length ? [`  ${label}:`, ...items.map((i) => `    - ${i}`)] : [];

  const lines = [`Resumed ${result.resumed.length} worker(s).`];
  if (result.resumed.length > 0) {
    lines.push(`  resumed: ${result.resumed.join(", ")}`);
  }
  lines.push(
    ...section(
      "skipped",
      result.skipped.map((s) => `${s.name} (${s.reason})`),
    ),
  );
  lines.push(
    ...section(
      "failed",
      result.failed.map((f) => `${f.name}: ${f.error}`),
    ),
  );
  return lines.join("\n");
}
