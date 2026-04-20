/**
 * Shape check for a team config.json. Returns true when the object carries
 * the minimum fields the plugin reads (name, leadAgentId, leadSessionId,
 * members array). Callers that need the typed shape should cast to their
 * local TeamConfig type after passing this guard.
 */
export function isValidTeamConfig(raw: unknown): raw is {
  readonly name: string;
  readonly leadAgentId: string;
  readonly leadSessionId: string;
  readonly members: readonly unknown[];
} {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.leadAgentId === "string" &&
    typeof obj.leadSessionId === "string" &&
    Array.isArray(obj.members)
  );
}
