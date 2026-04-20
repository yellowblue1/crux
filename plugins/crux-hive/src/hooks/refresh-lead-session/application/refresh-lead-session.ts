import { decideRefresh } from "../domain/decide.js";
import type { TeamLeadRepository } from "../domain/ports.js";
import type { RefreshDecision } from "../domain/types.js";

export async function refreshLeadSession(
  sessionId: string,
  cwd: string,
  repository: TeamLeadRepository,
): Promise<RefreshDecision> {
  const teams = await repository.listTeamLeads();
  const decision = decideRefresh(sessionId, cwd, teams);
  if (decision.kind === "noop") {
    return decision;
  }

  await repository.updateLeadSessionId(decision.teamName, decision.newLeadSessionId);
  return decision;
}
