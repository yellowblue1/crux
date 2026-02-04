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
 * Uses load-buffer + paste-buffer to handle long strings that would be truncated by send-keys
 */
export function sendKeys(windowId: string, keys: string): void {
  execOrThrow(`echo ${shellEscape(keys)} | tmux load-buffer -`);
  execOrThrow(`tmux paste-buffer -t ${shellEscape(windowId)}`);
  execOrThrow(`tmux send-keys -t ${shellEscape(windowId)} Enter`);
}

/**
 * Wait for shell initialization (needed before sending commands)
 */
export function waitForShellInit(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}
