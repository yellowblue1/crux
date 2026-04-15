import { readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, it } from "bun:test";
import type { ExecResult } from "../../shared/exec.js";
import { createTmuxAdapter } from "./tmux-adapter.js";

// Collect temp files created during tests for cleanup
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      const { rmSync } = require("node:fs");
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirs.length = 0;
});

function stubExec(result?: Partial<ExecResult>) {
  return (_cmd: string, _opts?: { timeout?: number }): ExecResult => ({
    success: true,
    stdout: "main",
    ...result,
  });
}

function captureExecAsync() {
  const captured: string[] = [];
  const fn = async (cmd: string): Promise<string> => {
    captured.push(cmd);
    return "@1";
  };
  return { fn, captured };
}

describe("createTmuxAdapter", () => {
  describe("isAvailable", () => {
    it("should return true when tmux session is active", () => {
      let capturedCommand = "";
      const execFn = (cmd: string): ExecResult => {
        capturedCommand = cmd;
        return { success: true, stdout: "main" };
      };
      const adapter = createTmuxAdapter(execFn);
      expect(adapter.isAvailable()).toBe(true);
      expect(capturedCommand).toBe('tmux display-message -p "#S"');
    });

    it("should return false when not in tmux", () => {
      const execFn = (): ExecResult => ({
        success: false,
        stdout: "",
        error: "no server running on /tmp/tmux-1000/default",
      });
      const adapter = createTmuxAdapter(execFn);
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe("createWindow", () => {
    it("should run tmux new-window without command when no command given", async () => {
      const { fn, captured } = captureExecAsync();
      const adapter = createTmuxAdapter(stubExec(), fn);

      const windowId = await adapter.createWindow("test-win", "/tmp/test");

      expect(windowId).toBe("@1");
      expect(captured).toHaveLength(1);
      expect(captured[0]).toBe(
        "tmux new-window -d -n 'test-win' -c '/tmp/test' -P -F \"#{window_id}\"",
      );
    });

    it("should write command to temp script and source it", async () => {
      const { fn, captured } = captureExecAsync();
      const adapter = createTmuxAdapter(stubExec(), fn);
      const command = "claude -- \"$(echo 'dGVzdA==' | base64 -d)\"";

      await adapter.createWindow("worker", "/tmp/worktree", command);

      expect(captured).toHaveLength(1);
      const tmuxCmd = captured[0];

      // Should source a temp script, not inline the command
      expect(tmuxCmd).toContain("-- \"$SHELL\" -lic");
      expect(tmuxCmd).toContain("source /tmp/crux-hive-");
      expect(tmuxCmd).not.toContain("base64");

      // Extract script path from the tmux command
      const match = tmuxCmd.match(/source (\/tmp\/crux-hive-[^']+\/launch\.sh)/);
      expect(match).not.toBeNull();
      const scriptPath = match![1];
      tempDirs.push(scriptPath.replace(/\/launch\.sh$/, ""));

      // Verify script content
      const content = readFileSync(scriptPath, "utf-8");
      expect(content).toContain(command);
      expect(content).toContain("rm -rf");
      expect(content).toContain("exec $SHELL -l");
    });

    it("should set temp script permissions to owner-only", async () => {
      const { fn, captured } = captureExecAsync();
      const adapter = createTmuxAdapter(stubExec(), fn);

      await adapter.createWindow("worker", "/tmp/worktree", "claude -- test");

      const tmuxCmd = captured[0];
      const match = tmuxCmd.match(/source (\/tmp\/crux-hive-[^']+\/launch\.sh)/);
      expect(match).not.toBeNull();
      const scriptPath = match![1];
      tempDirs.push(scriptPath.replace(/\/launch\.sh$/, ""));

      const stats = statSync(scriptPath);
      // 0o700 = owner rwx only
      expect(stats.mode & 0o777).toBe(0o700);
    });

    it("should handle commands with single quotes correctly", async () => {
      const { fn, captured } = captureExecAsync();
      const adapter = createTmuxAdapter(stubExec(), fn);
      // Command with single quotes (agent-teams flags + base64)
      const command =
        "claude --agent-id 'worker@team' --agent-name 'worker' -- \"$(echo 'dGVzdA==' | base64 -d)\"";

      await adapter.createWindow("worker", "/tmp/worktree", command);

      const tmuxCmd = captured[0];
      const match = tmuxCmd.match(/source (\/tmp\/crux-hive-[^']+\/launch\.sh)/);
      expect(match).not.toBeNull();
      const scriptPath = match![1];
      tempDirs.push(scriptPath.replace(/\/launch\.sh$/, ""));

      // Script should contain the command verbatim (no shellEscape mangling)
      const content = readFileSync(scriptPath, "utf-8");
      expect(content).toStartWith(command);
    });

    it("should escape window name and directory in tmux command", async () => {
      const { fn, captured } = captureExecAsync();
      const adapter = createTmuxAdapter(stubExec(), fn);

      await adapter.createWindow("my feature", "/path/with spaces", "claude");

      const tmuxCmd = captured[0];
      expect(tmuxCmd).toContain("-n 'my feature'");
      expect(tmuxCmd).toContain("-c '/path/with spaces'");
    });
  });
});
