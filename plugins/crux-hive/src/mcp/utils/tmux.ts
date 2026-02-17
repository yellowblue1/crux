import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execOrThrow, shellEscape } from "./exec.js";

/**
 * Check if running inside a tmux session
 */
export function isTmuxAvailable(): boolean {
  return !!process.env.TMUX;
}

/**
 * Create a new tmux window in the specified directory
 * Returns the window ID
 */
export function createWindow(name: string, dir: string): string {
  return execOrThrow(
    `tmux new-window -d -n ${shellEscape(name)} -c ${shellEscape(dir)} -P -F "#{window_id}"`,
  );
}

/**
 * Send keys to a tmux window
 * Uses load-buffer + paste-buffer to handle long strings that would be truncated by send-keys.
 * Writes to a temp file instead of piping via echo to avoid shell argument length limits.
 */
export async function sendKeys(windowId: string, keys: string): Promise<void> {
  const tmpFile = join(tmpdir(), `crux-tmux-${crypto.randomUUID()}.txt`);
  try {
    await Bun.write(tmpFile, keys, { mode: 0o600 });
    execOrThrow(`tmux load-buffer ${shellEscape(tmpFile)}`);
    execOrThrow(`tmux paste-buffer -t ${shellEscape(windowId)}`);
    execOrThrow(`tmux send-keys -t ${shellEscape(windowId)} Enter`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore cleanup failures */
    }
  }
}

/**
 * Wait for shell initialization (needed before sending commands)
 */
export function waitForShellInit(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}
