import { resolve } from "node:path";
import type { RefreshDecision, TeamLeadSummary } from "./types.js";

/**
 * Decide whether the current session should claim lead of an existing team.
 *
 * Background: Claude Code's TeamCreate is not idempotent — calling it with an
 * existing team name returns "already exists" and does NOT refresh
 * leadSessionId. Inbound teammate -> lead messages are then routed to the
 * previous session's inbox, silently breaking auto-delivery.
 *
 * Safe-refresh rules:
 *  - If any team already has leadSessionId === sessionId, the session is in
 *    sync; do nothing.
 *  - Otherwise collect teams whose lead member cwd matches the current cwd
 *    AND whose leadSessionId is dead (not present in live session ids).
 *    A live leadSessionId means another session is actively driving that
 *    team; refreshing would steal its inbox.
 *  - If exactly one such team remains, claim it. Zero or multiple: do
 *    nothing (ambiguous — safer to leave alone).
 */
export function decideRefresh(
  sessionId: string,
  cwd: string,
  teams: readonly TeamLeadSummary[],
  liveSessionIds: ReadonlySet<string>,
): RefreshDecision {
  if (teams.some((t) => t.leadSessionId === sessionId)) {
    return { kind: "noop" };
  }

  const normalizedCwd = resolve(cwd);
  const candidates = teams.filter(
    (t) => resolve(t.leadCwd) === normalizedCwd && !liveSessionIds.has(t.leadSessionId),
  );

  if (candidates.length !== 1) {
    return { kind: "noop" };
  }

  return {
    kind: "refresh",
    teamName: candidates[0].teamName,
    staleLeadSessionId: candidates[0].leadSessionId,
    newLeadSessionId: sessionId,
  };
}
