import { shellEscape } from "../../shared/exec.js";

/**
 * Builds the command that resumes a worker's Claude Code session in a tmux
 * window. Resume keeps the original sessionId (no --fork-session) so the team
 * config association stays valid, and coexists with the Agent Teams flags so
 * the worker re-attaches to its team. Both behaviors verified on Claude Code
 * 2.1.161.
 */
export function buildResumeCommand(args: {
  sessionId: string;
  agentTeamsFlags: string;
  pluginDir?: string;
}): string {
  const { sessionId, agentTeamsFlags, pluginDir } = args;

  const parts = ["claude", `--resume ${shellEscape(sessionId)}`];
  if (agentTeamsFlags) {
    parts.push(agentTeamsFlags);
  }
  if (pluginDir) {
    parts.push(`--plugin-dir ${shellEscape(pluginDir)}`);
  }
  return parts.join(" ");
}
