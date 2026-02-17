import { shellEscape } from "../../shared/exec.js";

/**
 * Builds the Agent Teams CLI flags for launching a teammate.
 * Pure function that constructs the flag string from team configuration.
 */
export function buildAgentTeamsFlags(args: {
  teamName: string;
  agentName: string;
  leadSessionId: string;
  agentColor?: string;
  model?: string;
  planMode?: boolean;
}): string {
  const { teamName, agentName, leadSessionId, agentColor, model, planMode } = args;
  const agentId = `${agentName}@${teamName}`;

  const flags = [
    `--agent-id ${shellEscape(agentId)}`,
    `--agent-name ${shellEscape(agentName)}`,
    `--team-name ${shellEscape(teamName)}`,
    `--parent-session-id ${shellEscape(leadSessionId)}`,
    `--agent-type Bash`,
  ];

  if (agentColor) {
    flags.push(`--agent-color ${shellEscape(agentColor)}`);
  }

  if (model) {
    flags.push(`--model ${shellEscape(model)}`);
  }

  if (planMode) {
    flags.push("--plan-mode-required");
  }

  return flags.join(" ");
}
