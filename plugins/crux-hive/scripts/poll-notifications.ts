#!/usr/bin/env bun
/**
 * Watches the orchestrator notifications directory and outputs notification JSON.
 * Uses fs.watch for near-instant detection with a 30-second fallback poll.
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

import { existsSync, type FSWatcher, readdirSync, readFileSync, unlinkSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FALLBACK_POLL_INTERVAL_MS = 30000;
const DEBOUNCE_MS = 100;
const DEFAULT_TIMEOUT_SECONDS = 600;

/**
 * Validates an orchestrator ID format.
 * Format: orch_ followed by exactly 12 lowercase hex characters.
 */
function isValidOrchestratorId(id: string): boolean {
  return /^orch_[a-f0-9]{12}$/.test(id);
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
    console.error("Expected format: orch_<12 hex chars>");
    return null;
  }

  return { orchestratorId, timeoutSeconds };
}

/**
 * Watches for notifications using fs.watch with fallback polling.
 */
class NotificationWatcher {
  private watcher: FSWatcher | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isCleanedUp = false;
  private notificationsDir: string;

  constructor(
    orchestratorId: string,
    private timeoutMs: number,
  ) {
    this.notificationsDir = getNotificationsDir(orchestratorId);
  }

  /**
   * Starts watching for notifications.
   * Resolves with notification content or null on timeout.
   */
  async watch(): Promise<string | null> {
    // Check for existing notifications immediately
    const existing = pollNotification(this.notificationsDir);
    if (existing) {
      return existing;
    }

    return new Promise((resolve) => {
      // Setup timeout
      this.timeoutTimer = setTimeout(() => {
        this.cleanup();
        resolve(null);
      }, this.timeoutMs);

      // Setup fs.watch if directory exists
      if (existsSync(this.notificationsDir)) {
        this.setupWatcher(resolve);
      }

      // Setup fallback polling (also handles case where directory doesn't exist yet)
      this.fallbackTimer = setInterval(() => {
        // Try to setup watcher if it doesn't exist yet
        if (!this.watcher && existsSync(this.notificationsDir)) {
          this.setupWatcher(resolve);
        }

        const notification = pollNotification(this.notificationsDir);
        if (notification) {
          this.cleanup();
          resolve(notification);
        }
      }, FALLBACK_POLL_INTERVAL_MS);
    });
  }

  private setupWatcher(resolve: (value: string | null) => void): void {
    if (this.watcher || this.isCleanedUp) {
      return;
    }

    try {
      this.watcher = watch(this.notificationsDir, (eventType, filename) => {
        // Only respond to file additions (rename event for new files)
        if (eventType !== "rename" || !filename?.endsWith(".json")) {
          return;
        }

        // Debounce to handle multiple rapid events
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
          if (this.isCleanedUp) {
            return;
          }

          const notification = pollNotification(this.notificationsDir);
          if (notification) {
            this.cleanup();
            resolve(notification);
          }
        }, DEBOUNCE_MS);
      });

      this.watcher.on("error", () => {
        // Watcher error - fallback polling will handle it
        if (this.watcher) {
          this.watcher.close();
          this.watcher = null;
        }
      });
    } catch {
      // Failed to setup watcher - fallback polling will handle it
    }
  }

  cleanup(): void {
    if (this.isCleanedUp) {
      return;
    }
    this.isCleanedUp = true;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.exit(1);
  }

  const { orchestratorId, timeoutSeconds } = parsed;
  const watcher = new NotificationWatcher(orchestratorId, timeoutSeconds * 1000);

  // Setup signal handlers for graceful cleanup
  const cleanup = (): void => {
    watcher.cleanup();
    process.exit(1);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  const notification = await watcher.watch();

  if (notification) {
    console.log("=== Notification ===");
    console.log(notification);
    process.exit(0);
  }

  // Timeout reached
  process.exit(124);
}

// Only run main() when executed directly, not when imported for testing
if (import.meta.main) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

// Export for testing
export {
  isValidOrchestratorId,
  getNotificationsDir,
  pollNotification,
  parseArgs,
  NotificationWatcher,
  FALLBACK_POLL_INTERVAL_MS,
  DEBOUNCE_MS,
  DEFAULT_TIMEOUT_SECONDS,
};
