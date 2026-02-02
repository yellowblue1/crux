#!/usr/bin/env bun
/**
 * Polls the orchestrator notifications directory and outputs notification JSON.
 *
 * Usage:
 *   bun run poll-notifications.ts <orchestrator_id> [--timeout=<seconds>]
 *
 * Arguments:
 *   orchestrator_id  The orchestrator session ID (e.g., orch_abc123456789)
 *   --timeout        Timeout in seconds (default: 600)
 *
 * Exit codes:
 *   0   - Notification found and output
 *   124 - Timeout (no notifications within timeout period)
 *   1   - Error (invalid arguments, etc.)
 *
 * Output:
 *   On success, outputs the notification JSON to stdout.
 *   The notification file is deleted after reading.
 */

import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_SECONDS = 600;

/**
 * Validates an orchestrator ID format.
 * Supports both old (8-char alphanumeric) and new (12-char hex) formats.
 */
function isValidOrchestratorId(id: string): boolean {
  return /^orch_[a-f0-9]{12}$/.test(id) || /^orch_[a-z0-9]{8}$/.test(id);
}

/**
 * Gets the notifications directory path for an orchestrator.
 */
function getNotificationsDir(orchestratorId: string): string {
  return join(tmpdir(), orchestratorId, "notifications");
}

/**
 * Reads and deletes the first notification file found.
 * Returns the notification content or null if no notifications.
 */
function pollNotification(notificationsDir: string): string | null {
  if (!existsSync(notificationsDir)) {
    return null;
  }

  const files = readdirSync(notificationsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    return null;
  }

  const filePath = join(notificationsDir, files[0]);
  try {
    const content = readFileSync(filePath, "utf-8");
    unlinkSync(filePath); // Delete after reading (atomic)
    return content;
  } catch {
    // File may have been deleted by another process
    return null;
  }
}

function parseArgs(args: string[]): { orchestratorId: string; timeoutSeconds: number } | null {
  let orchestratorId: string | undefined;
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;

  for (const arg of args) {
    if (arg.startsWith("--timeout=")) {
      const value = Number.parseInt(arg.slice("--timeout=".length), 10);
      if (Number.isNaN(value) || value <= 0) {
        console.error("Error: --timeout must be a positive integer");
        return null;
      }
      timeoutSeconds = value;
    } else if (!arg.startsWith("-")) {
      orchestratorId = arg;
    }
  }

  if (!orchestratorId) {
    console.error("Error: orchestrator_id is required");
    console.error("Usage: bun run poll-notifications.ts <orchestrator_id> [--timeout=<seconds>]");
    return null;
  }

  if (!isValidOrchestratorId(orchestratorId)) {
    console.error(`Error: Invalid orchestrator ID format: ${orchestratorId}`);
    console.error("Expected format: orch_<12 hex chars> or orch_<8 alphanumeric chars>");
    return null;
  }

  return { orchestratorId, timeoutSeconds };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.exit(1);
  }

  const { orchestratorId, timeoutSeconds } = parsed;
  const notificationsDir = getNotificationsDir(orchestratorId);
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const notification = pollNotification(notificationsDir);
    if (notification) {
      console.log("=== Notification ===");
      console.log(notification);
      process.exit(0);
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }

  // Timeout reached
  process.exit(124);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
