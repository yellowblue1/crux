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
 * whose lead member cwd matches the current cwd AND whose lead session is
 * no longer live, then refreshes leadSessionId to the current session.
 */

import { refreshLeadSession } from "./hooks/refresh-lead-session/application/refresh-lead-session.js";
import { createFileLiveSessionReader } from "./hooks/refresh-lead-session/infrastructure/file-live-session-reader.js";
import { createFileTeamLeadRepository } from "./hooks/refresh-lead-session/infrastructure/file-team-lead-repository.js";
import { runHook } from "./shared/run-hook.js";

type HookInput = {
  readonly sessionId: string;
  readonly cwd: string;
};

function parseHookInput(raw: string): HookInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const sessionId = obj.session_id;
  const cwd = obj.cwd;
  if (typeof sessionId !== "string" || typeof cwd !== "string") {
    return null;
  }
  return { sessionId, cwd };
}

async function main(): Promise<void> {
  const input = parseHookInput(await Bun.stdin.text());
  if (!input) {
    return;
  }

  await refreshLeadSession(
    input.sessionId,
    input.cwd,
    createFileTeamLeadRepository(),
    createFileLiveSessionReader(),
  );
}

runHook(main);
