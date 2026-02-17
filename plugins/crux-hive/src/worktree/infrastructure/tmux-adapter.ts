import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execOrThrow, shellEscape } from "../../shared/exec.js";
import type { TmuxAdapter } from "../domain/ports.js";

export function createTmuxAdapter(): TmuxAdapter {
  return {
    isAvailable(): boolean {
      return !!process.env.TMUX;
    },
    createWindow(name: string, dir: string): string {
      return execOrThrow(
        `tmux new-window -d -n ${shellEscape(name)} -c ${shellEscape(dir)} -P -F "#{window_id}"`,
      );
    },
    async sendKeys(windowId: string, keys: string): Promise<void> {
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
    },
    waitForShellInit(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 500));
    },
  };
}
