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

/**
 * Validates that the command matches the expected notification watcher pattern.
 * Uses strict regex to prevent bypass attacks that embed malicious code.
 *
 * Expected command format:
 *   bun run /path/to/scripts/poll-notifications.ts orch_<id>
 *
 * Security considerations:
 * - orch_id must be exactly 12 lowercase hex characters after "orch_"
 * - Path must not contain shell metacharacters or command separators
 * - Only allows the specific watcher pattern, not arbitrary commands
 */
export function isWatcherCommand(command: string): boolean {
  // Format: bun run <path>/scripts/poll-notifications.ts orch_<id>
  // Path allows safe directory characters, orchestrator ID is validated strictly
  const bunRunPattern = /^bun run ([\w./-]+)\/scripts\/poll-notifications\.ts (orch_[a-f0-9]{12})$/;

  return bunRunPattern.test(command);
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
