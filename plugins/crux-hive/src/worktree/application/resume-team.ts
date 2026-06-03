import type { TeamRepository } from "../../team/domain/ports.js";
import type { TeamMember } from "../../team/domain/types.js";
import { buildAgentTeamsFlags } from "../domain/agent-teams-flags.js";
import type { TmuxAdapter } from "../domain/ports.js";
import { buildResumeCommand } from "../domain/resume-command.js";

export type ResumeSkipReason =
  | "no-session-id"
  | "no-worktree"
  | "worktree-missing"
  | "no-transcript"
  | "already-running";

export interface ResumeTeamResult {
  resumed: string[];
  skipped: { name: string; reason: ResumeSkipReason }[];
  failed: { name: string; error: string }[];
}

export interface ResumeTeamDeps {
  tmux: TmuxAdapter;
  teamRepo: TeamRepository;
  /** True if the worktree directory still exists on disk. */
  worktreeExists(path: string): Promise<boolean>;
  /** True if a transcript exists for the session id (resume precondition). */
  transcriptExists(sessionId: string): Promise<boolean>;
  pluginDir?: string;
}

/**
 * Resumes every worker of a team after an instance restart, restoring each
 * worker's conversation history and its team association in one shot.
 *
 * Workers are resumed independently: a worker that cannot be resumed (missing
 * sessionId, missing worktree, missing transcript) is skipped with a reason,
 * and a worker that fails to launch is reported in `failed`. The caller (the
 * lead) sees an honest breakdown rather than a silent partial success.
 *
 * Idempotent: a worker whose tmux window is already alive is skipped, so this
 * is safe to run twice or from a partially recovered state.
 */
export async function resumeTeam(
  teamName: string,
  deps: ResumeTeamDeps,
): Promise<ResumeTeamResult | { error: string }> {
  const config = await deps.teamRepo.readConfig(teamName);
  if (!config) {
    return { error: `Team '${teamName}' not found.` };
  }
  if (!config.leadSessionId) {
    return { error: `Team '${teamName}' is missing leadSessionId.` };
  }

  const result: ResumeTeamResult = { resumed: [], skipped: [], failed: [] };

  // Workers are the non-lead members. The lead session is started by the user
  // before calling resume_team, so it is not resumed here.
  const workers = config.members.filter((m) => m.agentId !== config.leadAgentId);

  // Snapshot live pane paths once; the query is global and identical per worker.
  const livePanePaths = await deps.tmux.listPanePaths();

  // Serialized: tmux new-window is stateful and concurrent calls race.
  for (const worker of workers) {
    await resumeWorker(worker, teamName, config.leadSessionId, livePanePaths, deps, result);
  }

  return result;
}

async function resumeWorker(
  worker: TeamMember,
  teamName: string,
  leadSessionId: string,
  livePanePaths: ReadonlySet<string>,
  deps: ResumeTeamDeps,
  result: ResumeTeamResult,
): Promise<void> {
  const { name, sessionId, cwd, color, model, windowName } = worker;

  if (!sessionId) {
    result.skipped.push({ name, reason: "no-session-id" });
    return;
  }
  if (!cwd) {
    result.skipped.push({ name, reason: "no-worktree" });
    return;
  }
  if (!(await deps.worktreeExists(cwd))) {
    result.skipped.push({ name, reason: "worktree-missing" });
    return;
  }
  if (!(await deps.transcriptExists(sessionId))) {
    result.skipped.push({ name, reason: "no-transcript" });
    return;
  }
  if (livePanePaths.has(cwd)) {
    result.skipped.push({ name, reason: "already-running" });
    return;
  }

  const agentTeamsFlags = buildAgentTeamsFlags({
    teamName,
    agentName: name,
    leadSessionId,
    agentColor: color,
    model,
  });
  // `--resume <sessionId>` alone restores the session and keeps the original id
  // (no --session-id, which would conflict unless --fork-session is also set).
  const command = buildResumeCommand({
    sessionId,
    agentTeamsFlags,
    pluginDir: deps.pluginDir,
  });

  // Prefer the window name recorded at launch; fall back to the worktree's last
  // segment for members registered before windowName was recorded.
  const resolvedWindowName = windowName || cwd.split("/").pop() || name;
  try {
    await deps.tmux.createWindow(resolvedWindowName, cwd, command);
    result.resumed.push(name);
  } catch (e) {
    result.failed.push({ name, error: e instanceof Error ? e.message : String(e) });
  }
}
