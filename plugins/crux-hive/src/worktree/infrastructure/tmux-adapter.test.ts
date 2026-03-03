import { describe, expect, it } from "bun:test";
import type { ExecResult } from "../../shared/exec.js";
import { createTmuxAdapter } from "./tmux-adapter.js";

describe("createTmuxAdapter", () => {
  describe("isAvailable", () => {
    it("should return true when tmux session is active", () => {
      const execFn = (): ExecResult => ({ success: true, stdout: "main" });
      const adapter = createTmuxAdapter(execFn);
      expect(adapter.isAvailable()).toBe(true);
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
});
