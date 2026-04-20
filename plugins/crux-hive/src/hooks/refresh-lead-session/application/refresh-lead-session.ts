import { decideRefresh } from "../domain/decide.js";
import type { LiveSessionReader, TeamLeadRepository } from "../domain/ports.js";
import type { RefreshDecision } from "../domain/types.js";

export async function refreshLeadSession(
  sessionId: string,
  cwd: string,
  repository: TeamLeadRepository,
  liveSessions: LiveSessionReader,
): Promise<RefreshDecision> {
  const [teams, liveIds] = await Promise.all([
    repository.listTeamLeads(),
    liveSessions.listLiveSessionIds(),
  ]);

  const decision = decideRefresh(sessionId, cwd, teams, liveIds);
  if (decision.kind === "noop") {
    return decision;
  }

  await repository.updateLeadSessionId(
    decision.teamName,
    decision.staleLeadSessionId,
    decision.newLeadSessionId,
  );
  return decision;
}
