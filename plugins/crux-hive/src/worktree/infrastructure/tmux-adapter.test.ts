import { describe, expect, it } from "bun:test";
import type { ExecResult } from "../../shared/exec.js";
import { createTmuxAdapter } from "./tmux-adapter.js";

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

  describe("listPanePaths", () => {
    it("should return the set of pane paths", async () => {
      let capturedCommand = "";
      const execFn = (cmd: string): ExecResult => {
        capturedCommand = cmd;
        return { success: true, stdout: "/home/u/proj\n/home/u/worktrees/feat-a\n" };
      };
      const adapter = createTmuxAdapter(execFn);
      const paths = await adapter.listPanePaths();
      expect(paths.has("/home/u/worktrees/feat-a")).toBe(true);
      expect(paths.has("/home/u/proj")).toBe(true);
      expect(paths.has("/home/u/worktrees/other")).toBe(false);
      expect(capturedCommand).toBe('tmux list-panes -a -F "#{pane_current_path}"');
    });

    it("should drop blank lines", async () => {
      const execFn = (): ExecResult => ({ success: true, stdout: "/home/u/proj\n\n" });
      const adapter = createTmuxAdapter(execFn);
      const paths = await adapter.listPanePaths();
      expect(paths.has("")).toBe(false);
      expect(paths.size).toBe(1);
    });

    it("should return an empty set when the tmux command fails", async () => {
      const execFn = (): ExecResult => ({ success: false, stdout: "", error: "no server" });
      const adapter = createTmuxAdapter(execFn);
      expect((await adapter.listPanePaths()).size).toBe(0);
    });
  });
});
