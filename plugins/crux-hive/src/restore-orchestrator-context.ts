#!/usr/bin/env bun
/**
 * SessionStart hook (compact matcher) — restores orchestrator mode context
 * after context compaction by re-injecting condensed instructions.
 */

import { restoreOrchestratorContext } from "./hooks/orchestrator-context/application/restore-orchestrator-context.js";
import { createFileTeamReader } from "./hooks/orchestrator-context/infrastructure/file-team-reader.js";

async function main(): Promise<void> {
  let sessionId: string | undefined;
  try {
    const input = await Bun.stdin.text();
    const parsed: unknown = JSON.parse(input);
    if (
      parsed &&
      typeof parsed === "object" &&
      "session_id" in parsed &&
      typeof (parsed as Record<string, unknown>).session_id === "string"
    ) {
      sessionId = (parsed as Record<string, unknown>).session_id as string;
    }
  } catch {
    // stdin may be empty or invalid — not an orchestrator session
  }

  if (!sessionId) {
    return;
  }

  const context = await restoreOrchestratorContext(sessionId, {
    teamConfigReader: createFileTeamReader(),
  });

  if (context) {
    const output = {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
    };
    console.log(JSON.stringify(output));
  }
}

main().catch(() => {
  // Always exit cleanly — hook failures must not block the session
});
