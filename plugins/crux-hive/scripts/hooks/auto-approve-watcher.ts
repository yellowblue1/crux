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
 * Supported command formats:
 *
 * 1. New format (bun run script):
 *    bun run /path/to/scripts/poll-notifications.ts orch_<id>
 *
 * 2. Legacy format (bash with NOTIF_DIR):
 *    NOTIF_DIR="/path/to/tmpdir/orch_xxxxxxxx/notifications"; <watcher logic>
 *
 * Security considerations:
 * - orch_id must be exactly 8 lowercase alphanumeric or 12 hex characters after "orch_"
 * - Path must not contain shell metacharacters or command separators
 * - Only allows the specific watcher patterns, not arbitrary commands
 */
function isWatcherCommand(command: string): boolean {
  // New format: bun run <path>/scripts/poll-notifications.ts orch_<id>
  // Path allows safe directory characters, orchestrator ID is validated strictly
  const bunRunPattern =
    /^bun run ([\w./-]+)\/scripts\/poll-notifications\.ts (orch_([a-z0-9]{8}|[a-f0-9]{12}))$/;

  if (bunRunPattern.test(command)) {
    return true;
  }

  // Legacy format: NOTIF_DIR="/safe/path/orch_[id]/notifications"
  // Supports both old format (8 alphanumeric) and new format (12 hex chars)
  const notifDirPattern =
    /^NOTIF_DIR="(\/[\w./-]+\/orch_([a-z0-9]{8}|[a-f0-9]{12})\/notifications)"/;

  const match = command.match(notifDirPattern);
  if (!match) {
    return false;
  }

  // Verify the command contains the expected watcher structure
  // The watcher uses: while true; do ... timeout 600 ... done
  // Must have timeout 600 for the 10-minute limit
  if (!command.includes("timeout 600")) {
    return false;
  }

  // Ensure the command structure matches expected watcher pattern
  // Should include the polling loop with inotifywait or similar
  if (
    !command.includes("while true") ||
    !command.includes("done") ||
    (!command.includes("inotifywait") && !command.includes("fswatch"))
  ) {
    return false;
  }

  // Additional safety: ensure no obvious command injection patterns
  // Reject if command contains patterns that could be used to break out
  const dangerousPatterns = [
    /\$\([^)]*\).*\$\([^)]*\)/, // Multiple command substitutions (suspicious)
    /;\s*rm\s/, // rm command after semicolon
    /;\s*curl\s/, // curl after semicolon
    /;\s*wget\s/, // wget after semicolon
    /`[^`]+`/, // Backtick command substitution
    /\|\s*sh\b/, // Piping to shell
    /\|\s*bash\b/, // Piping to bash
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return false;
    }
  }

  return true;
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
