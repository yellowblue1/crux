#!/usr/bin/env bun
/**
 * PreToolUse hook: Auto-approves the orchestrator notification watcher Bash command
 *
 * This hook runs before Bash commands execute. If the command matches the
 * notification watcher pattern, it grants permission automatically.
 *
 * Receives JSON on stdin:
 * {
 *   "tool_name": "Bash",
 *   "tool_input": { "command": "..." }
 * }
 *
 * On match, outputs:
 * {
 *   "hookSpecificOutput": {
 *     "hookEventName": "PreToolUse",
 *     "permissionDecision": "allow",
 *     "permissionDecisionReason": "..."
 *   }
 * }
 */

interface HookInput {
  tool_name: string;
  tool_input: {
    command?: string;
  };
}

function isWatcherCommand(command: string): boolean {
  // Match the orchestrator notification watcher pattern
  // The command includes:
  // 1. NOTIF_DIR=" with path containing orch_ (orchestrator directory - tmpdir varies by OS)
  // 2. /notifications" (notifications subdirectory)
  // 3. timeout 600 (10-minute timeout for background task limit)
  return (
    command.includes('NOTIF_DIR="') &&
    command.includes("orch_") &&
    command.includes('/notifications"') &&
    command.includes("timeout 600")
  );
}

async function main() {
  const input = await Bun.stdin.text();

  if (!input.trim()) {
    process.exit(0);
  }

  let data: HookInput;
  try {
    data = JSON.parse(input);
  } catch {
    // Invalid JSON, let normal flow proceed
    process.exit(0);
  }

  // Only handle Bash tool
  if (data.tool_name !== "Bash") {
    process.exit(0);
  }

  const command = data.tool_input?.command || "";

  if (isWatcherCommand(command)) {
    // Auto-approve the watcher command
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: "Auto-approved: orchestrator notification watcher",
        },
      }),
    );
    process.exit(0);
  }

  // For other commands, don't make a decision (let normal flow proceed)
  process.exit(0);
}

main().catch((err) => {
  console.error("[auto-approve-watcher] Error:", err);
  process.exit(0); // Don't fail the hook
});
