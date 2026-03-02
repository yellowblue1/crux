import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execAsync, execOrThrowAsync, shellEscape } from "../../shared/exec.js";
import type { TmuxAdapter } from "../domain/ports.js";

const SHELL_READY_INTERVAL_MS = 250;
const SHELL_READY_TIMEOUT_MS = 10_000;
const CLAUDE_READY_INTERVAL_MS = 500;
const CLAUDE_READY_TIMEOUT_MS = 15_000;

const SHELL_PROMPT_PATTERN = /[$%#>❯]\s*$/;

export function isShellPromptVisible(paneContent: string): boolean {
  const lastLine = paneContent.trimEnd().split("\n").pop() ?? "";
  return SHELL_PROMPT_PATTERN.test(lastLine);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTmuxAdapter(): TmuxAdapter {
  async function capturePaneContent(windowId: string): Promise<string> {
    const result = await execAsync(`tmux capture-pane -t ${shellEscape(windowId)} -p`);
    return result.success ? result.stdout : "";
  }

  return {
    isAvailable(): boolean {
      return !!process.env.TMUX;
    },
    async createWindow(name: string, dir: string): Promise<string> {
      return execOrThrowAsync(
        `tmux new-window -d -n ${shellEscape(name)} -c ${shellEscape(dir)} -P -F "#{window_id}"`,
      );
    },
    async sendKeys(windowId: string, keys: string): Promise<void> {
      const tmpFile = join(tmpdir(), `crux-tmux-${crypto.randomUUID()}.txt`);
      try {
        await Bun.write(tmpFile, keys, { mode: 0o600 });
        await execOrThrowAsync(`tmux load-buffer ${shellEscape(tmpFile)}`);
        await execOrThrowAsync(`tmux paste-buffer -t ${shellEscape(windowId)}`);
        await execOrThrowAsync(`tmux send-keys -t ${shellEscape(windowId)} Enter`);
      } finally {
        try {
          unlinkSync(tmpFile);
        } catch {
          /* ignore cleanup failures */
        }
      }
    },
    capturePaneContent,
    async waitForShellReady(windowId: string): Promise<void> {
      const maxAttempts = Math.ceil(SHELL_READY_TIMEOUT_MS / SHELL_READY_INTERVAL_MS);
      for (let i = 0; i < maxAttempts; i++) {
        const content = await capturePaneContent(windowId);
        if (isShellPromptVisible(content)) {
          return;
        }
        await delay(SHELL_READY_INTERVAL_MS);
      }
      throw new Error(`Shell initialization timed out after ${SHELL_READY_TIMEOUT_MS}ms`);
    },
    async waitForClaudeReady(windowId: string): Promise<void> {
      const maxAttempts = Math.ceil(CLAUDE_READY_TIMEOUT_MS / CLAUDE_READY_INTERVAL_MS);
      for (let i = 0; i < maxAttempts; i++) {
        const content = await capturePaneContent(windowId);
        if (content.includes("Claude")) {
          return;
        }
        await delay(CLAUDE_READY_INTERVAL_MS);
      }
      throw new Error(`Claude Code failed to start within ${CLAUDE_READY_TIMEOUT_MS}ms`);
    },
  };
}
