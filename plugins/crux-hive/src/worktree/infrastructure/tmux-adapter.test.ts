import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { INHERITED_ENV_VARS } from "../../shared/env-vars.js";
import type { ExecResult } from "../../shared/exec.js";

let capturedAsyncCommand = "";

mock.module("../../shared/exec.js", () => ({
  exec: (_cmd: string): ExecResult => ({ success: true, stdout: "" }),
  execOrThrowAsync: async (cmd: string): Promise<string> => {
    capturedAsyncCommand = cmd;
    return "@0";
  },
  shellEscape: (str: string): string => `'${str.replace(/'/g, "'\\''")}'`,
}));

const { createTmuxAdapter } = await import("./tmux-adapter.js");

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
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      capturedAsyncCommand = "";
      for (const key of INHERITED_ENV_VARS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });

    it("should prepend inherited env vars to command", async () => {
      process.env.CLAUDE_CODE_USE_BEDROCK = "1";
      process.env.AWS_REGION = "us-east-1";

      const adapter = createTmuxAdapter();
      await adapter.createWindow("test", "/tmp/test", "claude");

      expect(capturedAsyncCommand).toContain("CLAUDE_CODE_USE_BEDROCK=");
      expect(capturedAsyncCommand).toContain("AWS_REGION=");
      expect(capturedAsyncCommand).toContain("export ");
      expect(capturedAsyncCommand).toContain("claude");
    });

    it("should not add env prefix when no relevant vars are set", async () => {
      const adapter = createTmuxAdapter();
      await adapter.createWindow("test", "/tmp/test", "claude");

      expect(capturedAsyncCommand).not.toContain("export ");
      expect(capturedAsyncCommand).toContain("claude");
    });
  });
});
