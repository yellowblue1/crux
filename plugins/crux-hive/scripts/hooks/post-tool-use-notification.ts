#!/usr/bin/env bun
/**
 * PostToolUse hook: Reminds workers to notify the orchestrator after Bash commands
 *
 * This hook checks if the session is orchestrated and if a notification has
 * already been sent. If orchestrated and not yet notified, it outputs
 * additionalContext that reminds Claude to call send_message.
 *
 * Receives JSON on stdin:
 * {
 *   "session_id": "...",
 *   "transcript_path": "...",
 *   "cwd": "...",
 *   "hook_event_name": "PostToolUse",
 *   "tool_name": "Bash",
 *   "tool_input": { "command": "..." },
 *   "tool_response": { ... },
 *   "tool_use_id": "..."
 * }
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findGitRoot } from "../../src/git-utils.js";

interface PostToolUsePayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: {
    command?: string;
  };
  tool_response: unknown;
  tool_use_id: string;
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext: string;
  };
}

/**
 * Get orchestrator ID from .claude/.orchestrator-id file
 * Searches from cwd up to git root for .claude directory
 */
export function getOrchestratorId(cwd: string): string | null {
  const gitRoot = findGitRoot(cwd);
  const searchDir = gitRoot || cwd;
  const orchestratorIdPath = join(searchDir, ".claude", ".orchestrator-id");
  if (!existsSync(orchestratorIdPath)) {
    return null;
  }
  try {
    return readFileSync(orchestratorIdPath, "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Check if notification has already been sent for this session
 */
export function hasNotificationBeenSent(cwd: string): boolean {
  const gitRoot = findGitRoot(cwd);
  const searchDir = gitRoot || cwd;
  const notificationSentPath = join(searchDir, ".claude", ".notification-sent");
  return existsSync(notificationSentPath);
}

/**
 * Mark that a notification has been sent
 */
export function markNotificationSent(cwd: string): void {
  const gitRoot = findGitRoot(cwd);
  const searchDir = gitRoot || cwd;
  const notificationSentPath = join(searchDir, ".claude", ".notification-sent");
  try {
    // Ensure .claude directory exists
    const claudeDir = dirname(notificationSentPath);
    if (!existsSync(claudeDir)) {
      return; // Don't create .claude dir if it doesn't exist
    }
    writeFileSync(notificationSentPath, new Date().toISOString());
  } catch {
    // Ignore write errors
  }
}

/**
 * Build the additionalContext string for hook output
 */
export function buildAdditionalContext(orchestratorId: string): string {
  return `IMPORTANT: You are a worker in an orchestrated session. When your task is complete (PR created, research done, or if you have questions/blockers), you MUST notify the orchestrator.

Call \`mcp__plugin_crux-hive_crux__send_message\` with:
- message_type: "task_complete" | "task_failed" | "question"
- content: { summary: "...", pr_url?: "...", branch?: "...", question?: "...", error?: "..." }

The orchestrator (ID: ${orchestratorId}) is waiting for your notification.`;
}

async function main() {
  // Read hook payload from stdin
  const input = await Bun.stdin.text();

  if (!input.trim()) {
    process.exit(0);
  }

  let payload: PostToolUsePayload;
  try {
    payload = JSON.parse(input);
  } catch {
    // Invalid JSON, exit silently
    process.exit(0);
  }

  const cwd = payload.cwd || process.cwd();

  // Check if this session was spawned by an orchestrator
  const orchestratorId = getOrchestratorId(cwd);
  if (!orchestratorId) {
    // Not an orchestrated session, nothing to do
    process.exit(0);
  }

  // Check if notification has already been sent
  if (hasNotificationBeenSent(cwd)) {
    // Already notified, no need to remind again
    process.exit(0);
  }

  // Output hook response with additionalContext reminder
  const output: HookOutput = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: buildAdditionalContext(orchestratorId),
    },
  };

  console.log(JSON.stringify(output));
}

main().catch((err) => {
  console.error("[post-tool-use-notification] Error:", err);
  process.exit(0); // Don't fail the hook
});
