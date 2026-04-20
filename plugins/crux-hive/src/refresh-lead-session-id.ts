#!/usr/bin/env bun
/**
 * UserPromptSubmit hook — refreshes the orchestrator team's leadSessionId to
 * the current session when the previous lead session is stale.
 *
 * Claude Code's built-in TeamCreate is not idempotent: calling it with an
 * existing team name returns "already exists" and does NOT update
 * leadSessionId. Inbound teammate -> lead messages are then routed to the
 * previous session's inbox, silently breaking auto-delivery.
 *
 * This hook runs before each user prompt is processed. It locates a team
 * whose lead member cwd matches the current cwd and refreshes
 * leadSessionId to the current session, but only when no team already
 * points at this session (so single-session workflows are untouched).
 */

import { refreshLeadSession } from "./hooks/refresh-lead-session/application/refresh-lead-session.js";
import { createFileTeamLeadRepository } from "./hooks/refresh-lead-session/infrastructure/file-team-lead-repository.js";

async function main(): Promise<void> {
  let sessionId: string | undefined;
  let cwd: string | undefined;

  try {
    const input = await Bun.stdin.text();
    const parsed: unknown = JSON.parse(input);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.session_id === "string") {
        sessionId = obj.session_id;
      }
      if (typeof obj.cwd === "string") {
        cwd = obj.cwd;
      }
    }
  } catch {
    // stdin may be empty or invalid — treat as no-op
  }

  if (!sessionId || !cwd) {
    return;
  }

  await refreshLeadSession(sessionId, cwd, createFileTeamLeadRepository());
}

main().catch(() => {
  // Always exit cleanly — hook failures must never block the user prompt
});
