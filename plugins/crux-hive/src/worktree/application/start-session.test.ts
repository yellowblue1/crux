import { describe, expect, it } from "bun:test";
import type { TeamRepository } from "../../team/domain/ports.js";
import type { ConfigAdapter, GitAdapter, TmuxAdapter } from "../domain/ports.js";
import { startSession } from "./start-session.js";

function createMockGit(overrides?: Partial<GitAdapter>): GitAdapter {
  return {
    createWorktree: async () => ({ success: true as const }),
    getWorktreePath: async () => "/worktrees/test-branch",
    ...overrides,
  };
}

function createMockTmux(overrides?: Partial<TmuxAdapter>): TmuxAdapter {
  return {
    isAvailable: () => true,
    createWindow: async () => "@1",
    sendKeys: async () => {},
    capturePaneContent: async () => "$ ",
    waitForShellReady: async () => {},
    waitForClaudeReady: async () => {},
    ...overrides,
  };
}

function createMockConfig(overrides?: Partial<ConfigAdapter>): ConfigAdapter {
  return {
    getMcpServersFromProject: async () => [],
    updateClaudeConfig: async () => {},
    ...overrides,
  };
}

function createMockTeamRepo(overrides?: Partial<TeamRepository>): TeamRepository {
  return {
    readConfig: async () => null,
    getLeadSessionId: async () => null,
    registerMember: async () => {},
    deregisterMember: async () => false,
    createInbox: async () => {},
    removeInbox: async () => false,
    findWorkerByWorktreePath: async () => null,
    ...overrides,
  };
}

function defaultDeps(overrides?: {
  git?: Partial<GitAdapter>;
  tmux?: Partial<TmuxAdapter>;
  config?: Partial<ConfigAdapter>;
  teamRepo?: Partial<TeamRepository>;
}) {
  return {
    git: createMockGit(overrides?.git),
    tmux: createMockTmux(overrides?.tmux),
    config: createMockConfig(overrides?.config),
    teamRepo: createMockTeamRepo(overrides?.teamRepo),
    cwd: "/project",
  };
}

describe("startSession", () => {
  describe("validation", () => {
    it("should fail when branch is empty", async () => {
      const result = await startSession({ branch: "" }, defaultDeps());
      expect(result).toEqual({ success: false, error: "branch parameter is required" });
    });

    it("should fail when branch contains invalid characters", async () => {
      const result = await startSession({ branch: "feat/test;rm -rf" }, defaultDeps());
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid branch name");
      }
    });

    it("should fail when tmux is not available", async () => {
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({ tmux: { isAvailable: () => false } }),
      );
      expect(result).toEqual({ success: false, error: "Must be run inside a tmux session" });
    });

    it("should fail when teamName is provided without agentName", async () => {
      const result = await startSession(
        { branch: "feat/test", teamName: "my-team" },
        defaultDeps(),
      );
      expect(result).toEqual({
        success: false,
        error: "agentName is required when teamName is provided",
      });
    });

    it("should fail when fromRef contains invalid characters", async () => {
      const result = await startSession(
        { branch: "feat/test", fromRef: "main;drop table" },
        defaultDeps(),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid fromRef");
      }
    });

    it("should fail when pluginDir is an empty string", async () => {
      const result = await startSession({ branch: "feat/test", pluginDir: "" }, defaultDeps());
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("pluginDir must be a non-empty string");
      }
    });
  });

  describe("happy path", () => {
    it("should return success with worktree path", async () => {
      const result = await startSession({ branch: "feat/test" }, defaultDeps());
      expect(result).toEqual({ success: true, worktreePath: "/worktrees/test-branch" });
    });

    it("should call sendKeys with the claude command", async () => {
      let sentKeys = "";
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            sendKeys: async (_windowId: string, keys: string) => {
              sentKeys = keys;
            },
          },
        }),
      );
      expect(sentKeys).toContain("claude");
    });

    it("should include prompt as base64 when provided", async () => {
      let sentKeys = "";
      await startSession(
        { branch: "feat/test", prompt: "hello world" },
        defaultDeps({
          tmux: {
            sendKeys: async (_windowId: string, keys: string) => {
              sentKeys = keys;
            },
          },
        }),
      );
      expect(sentKeys).toContain("base64");
    });
  });

  describe("shell readiness polling", () => {
    it("should pass windowId from createWindow to waitForShellReady", async () => {
      let receivedWindowId = "";
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            createWindow: async () => "@42",
            waitForShellReady: async (windowId: string) => {
              receivedWindowId = windowId;
            },
          },
        }),
      );
      expect(result.success).toBe(true);
      expect(receivedWindowId).toBe("@42");
    });

    it("should return error when shell initialization times out", async () => {
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            waitForShellReady: async () => {
              throw new Error("Shell initialization timed out after 10000ms");
            },
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Shell initialization failed");
        expect(result.error).toContain("timed out");
      }
    });

    it("should not call sendKeys when shell readiness fails", async () => {
      let sendKeysCalled = false;
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            waitForShellReady: async () => {
              throw new Error("timeout");
            },
            sendKeys: async () => {
              sendKeysCalled = true;
            },
          },
        }),
      );
      expect(sendKeysCalled).toBe(false);
    });
  });

  describe("Claude startup verification", () => {
    it("should pass windowId from createWindow to waitForClaudeReady", async () => {
      let receivedWindowId = "";
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            createWindow: async () => "@99",
            waitForClaudeReady: async (windowId: string) => {
              receivedWindowId = windowId;
            },
          },
        }),
      );
      expect(result.success).toBe(true);
      expect(receivedWindowId).toBe("@99");
    });

    it("should return error when Claude Code fails to start", async () => {
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            waitForClaudeReady: async () => {
              throw new Error("Claude Code failed to start within 15000ms");
            },
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Claude Code startup verification failed");
      }
    });

    it("should call waitForShellReady then sendKeys then waitForClaudeReady", async () => {
      const callOrder: string[] = [];
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            waitForShellReady: async () => {
              callOrder.push("waitForShellReady");
            },
            sendKeys: async () => {
              callOrder.push("sendKeys");
            },
            waitForClaudeReady: async () => {
              callOrder.push("waitForClaudeReady");
            },
          },
        }),
      );
      expect(callOrder).toEqual(["waitForShellReady", "sendKeys", "waitForClaudeReady"]);
    });
  });

  describe("tmux window failure", () => {
    it("should return error when createWindow throws", async () => {
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            createWindow: async () => {
              throw new Error("no tmux server");
            },
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to create tmux window");
      }
    });
  });

  describe("team registration failure", () => {
    it("should return error when team does not exist", async () => {
      const result = await startSession(
        { branch: "feat/test", teamName: "ghost-team", agentName: "worker" },
        defaultDeps({ teamRepo: { getLeadSessionId: async () => null } }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("ghost-team");
      }
    });

    it("should return error when registerMember throws", async () => {
      const result = await startSession(
        { branch: "feat/test", teamName: "my-team", agentName: "worker" },
        defaultDeps({
          teamRepo: {
            getLeadSessionId: async () => "session-123",
            registerMember: async () => {
              throw new Error("write failed");
            },
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to register teammate");
      }
    });
  });

  describe("worktree creation failure", () => {
    it("should return error when worktree creation fails", async () => {
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          git: {
            createWorktree: async () => ({ success: false as const, error: "branch exists" }),
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to create worktree");
      }
    });

    it("should return error when getWorktreePath returns empty string", async () => {
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          git: {
            createWorktree: async () => ({ success: true as const }),
            getWorktreePath: async () => "",
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Failed to get worktree path");
      }
    });

    it("should return error when getWorktreePath throws", async () => {
      const result = await startSession(
        { branch: "feat/test" },
        defaultDeps({
          git: {
            createWorktree: async () => ({ success: true as const }),
            getWorktreePath: async () => {
              throw new Error("path not found");
            },
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to get worktree path");
      }
    });
  });
});
