import { decideRefresh } from "../domain/decide.js";
import type { LiveSessionReader, TeamLeadRepository } from "../domain/ports.js";

type RefreshOutcome =
  | { readonly kind: "noop" }
  | { readonly kind: "refreshed"; readonly teamName: string }
  /**
   * Decision said to refresh, but another session already updated
   * leadSessionId between listTeamLeads() and CAS. No write happened.
   */
  | { readonly kind: "raced"; readonly teamName: string };

export async function refreshLeadSession(
  sessionId: string,
  cwd: string,
  repository: TeamLeadRepository,
  liveSessions: LiveSessionReader,
): Promise<RefreshOutcome> {
  const [teams, liveIds] = await Promise.all([
    repository.listTeamLeads(),
    liveSessions.listLiveSessionIds(),
  ]);

  const decision = decideRefresh(sessionId, cwd, teams, liveIds);
  if (decision.kind === "noop") {
    return { kind: "noop" };
  }

  const written = await repository.updateLeadSessionId(
    decision.teamName,
    decision.staleLeadSessionId,
    decision.newLeadSessionId,
  );
  return written
    ? { kind: "refreshed", teamName: decision.teamName }
    : { kind: "raced", teamName: decision.teamName };
}
