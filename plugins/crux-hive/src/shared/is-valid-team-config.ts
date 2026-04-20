/**
 * Shape checks for a team config.json written by Claude Code's built-in
 * team management. Shared between readers so the shape assumption stays
 * single-sourced.
 */

type ValidatedMember = {
  readonly agentId: string;
  readonly name: string;
  readonly agentType: string;
  readonly model?: string;
  readonly color?: string;
  readonly tmuxPaneId?: string;
  readonly backendType?: string;
  readonly isActive?: boolean;
  readonly cwd?: string;
};

type ValidatedConfig = {
  readonly name: string;
  readonly leadAgentId: string;
  readonly leadSessionId: string;
  readonly members: readonly ValidatedMember[];
};

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

export function isValidTeamMember(raw: unknown): raw is ValidatedMember {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.agentId === "string" &&
    typeof obj.name === "string" &&
    typeof obj.agentType === "string" &&
    isOptionalString(obj.model) &&
    isOptionalString(obj.color) &&
    isOptionalString(obj.tmuxPaneId) &&
    isOptionalString(obj.backendType) &&
    isOptionalString(obj.cwd) &&
    isOptionalBoolean(obj.isActive)
  );
}

export function isValidTeamConfig(raw: unknown): raw is ValidatedConfig {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.leadAgentId === "string" &&
    typeof obj.leadSessionId === "string" &&
    Array.isArray(obj.members) &&
    obj.members.every(isValidTeamMember)
  );
}
