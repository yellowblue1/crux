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
    listPanePaths: async () => new Set(),
    ...overrides,
  };
}

function createMockConfig(overrides?: Partial<ConfigAdapter>): ConfigAdapter {
  return {
    getMcpServersFromProject: async () => [],
    updateClaudeConfig: async () => {},
    readWorkerInstructions: async () => null,
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
  });

  describe("happy path", () => {
    it("should return success with worktree path", async () => {
      const result = await startSession({ branch: "feat/test" }, defaultDeps());
      expect(result).toEqual({ success: true, worktreePath: "/worktrees/test-branch" });
    });

    it("should pass claude command to createWindow", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).toContain("claude");
    });

    it("should pass prompt as base64 in command", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", prompt: "hello world" },
        defaultDeps({
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      const expectedBase64 = Buffer.from("hello world").toString("base64");
      expect(receivedCommand).toContain(expectedBase64);
      expect(receivedCommand).toContain("base64 -d");
    });

    it("should pass worktree path as dir to createWindow", async () => {
      let receivedDir = "";
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            createWindow: async (_name: string, dir: string) => {
              receivedDir = dir;
              return "@1";
            },
          },
        }),
      );
      expect(receivedDir).toBe("/worktrees/test-branch");
    });

    it("should use branch suffix as window name", async () => {
      let receivedName = "";
      await startSession(
        { branch: "feat/my-feature" },
        defaultDeps({
          tmux: {
            createWindow: async (name: string) => {
              receivedName = name;
              return "@1";
            },
          },
        }),
      );
      expect(receivedName).toBe("my-feature");
    });

    it("should use full branch name when no slash present", async () => {
      let receivedName = "";
      await startSession(
        { branch: "main" },
        defaultDeps({
          tmux: {
            createWindow: async (name: string) => {
              receivedName = name;
              return "@1";
            },
          },
        }),
      );
      expect(receivedName).toBe("main");
    });

    it("should use last segment for multi-slash branch", async () => {
      let receivedName = "";
      await startSession(
        { branch: "feat/scope/detail" },
        defaultDeps({
          tmux: {
            createWindow: async (name: string) => {
              receivedName = name;
              return "@1";
            },
          },
        }),
      );
      expect(receivedName).toBe("detail");
    });

    it("should include agent teams flags in command", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", teamName: "my-team", agentName: "worker" },
        defaultDeps({
          teamRepo: {
            getLeadSessionId: async () => "session-abc",
            registerMember: async () => {},
            createInbox: async () => {},
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).toContain("--team-name");
      expect(receivedCommand).toContain("my-team");
      expect(receivedCommand).toContain("--parent-session-id");
    });

    it("should mint a sessionId, pass it via --session-id, and record it with the window name", async () => {
      let receivedCommand = "";
      let recordedSessionId: string | undefined;
      let recordedWindowName: string | undefined;
      await startSession(
        { branch: "feat/test", teamName: "my-team", agentName: "worker" },
        defaultDeps({
          teamRepo: {
            getLeadSessionId: async () => "session-abc",
            registerMember: async (_team, member) => {
              recordedSessionId = member.sessionId;
              recordedWindowName = member.windowName;
            },
            createInbox: async () => {},
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      // A valid UUID was minted and recorded.
      expect(recordedSessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      // The same id is passed to the launch command.
      expect(receivedCommand).toContain("--session-id");
      expect(receivedCommand).toContain(recordedSessionId ?? "MISSING");
      // The window name used at launch is recorded for resume.
      expect(recordedWindowName).toBe("test");
    });

    it("should not pass --session-id when not a team worker", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).not.toContain("--session-id");
    });

    it("should not include --permission-mode plan in command", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", planMode: true },
        defaultDeps({
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).not.toContain("--permission-mode plan");
    });

    it("should include pluginDir flag in command", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", pluginDir: "/path/to/plugin" },
        defaultDeps({
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).toContain("--plugin-dir");
      expect(receivedCommand).toContain("/path/to/plugin");
    });
  });

  describe("worker instructions", () => {
    it("should prepend worker instructions to prompt", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", prompt: "do the task" },
        defaultDeps({
          config: {
            readWorkerInstructions: async () => "Be concise.",
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      const expectedBase64 = Buffer.from("Be concise.\n\ndo the task").toString("base64");
      expect(receivedCommand).toContain(expectedBase64);
    });

    it("should use worker instructions as prompt when no prompt provided", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          config: {
            readWorkerInstructions: async () => "Follow these rules.",
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      const expectedBase64 = Buffer.from("Follow these rules.").toString("base64");
      expect(receivedCommand).toContain(expectedBase64);
    });

    it("should pass prompt unchanged when no worker instructions", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", prompt: "original prompt" },
        defaultDeps({
          config: {
            readWorkerInstructions: async () => null,
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      const expectedBase64 = Buffer.from("original prompt").toString("base64");
      expect(receivedCommand).toContain(expectedBase64);
    });

    it("should not add prompt when neither instructions nor prompt exist", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          config: {
            readWorkerInstructions: async () => null,
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).not.toContain("base64 -d");
    });

    it("should include -- before prompt in command", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", prompt: "do the task" },
        defaultDeps({
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).toMatch(/claude .+ -- "|claude -- "/);
    });

    it("should handle hyphen-prefixed worker instructions", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", prompt: "do the task" },
        defaultDeps({
          config: {
            readWorkerInstructions: async () => "- Use /pr-workflow skill for all PR operations",
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).toContain(" -- ");
    });

    it("should handle flag-like worker instructions", async () => {
      let receivedCommand = "";
      await startSession(
        { branch: "feat/test", prompt: "do the task" },
        defaultDeps({
          config: {
            readWorkerInstructions: async () => "--verbose mode enabled",
          },
          tmux: {
            createWindow: async (_name: string, _dir: string, command?: string) => {
              receivedCommand = command ?? "";
              return "@1";
            },
          },
        }),
      );
      expect(receivedCommand).toContain(" -- ");
    });

    it("should read worker instructions from project dir, not worktree path", async () => {
      let capturedDir = "";
      await startSession(
        { branch: "feat/test" },
        defaultDeps({
          config: {
            readWorkerInstructions: async (dir: string) => {
              capturedDir = dir;
              return null;
            },
          },
        }),
      );
      expect(capturedDir).toBe("/project");
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

  describe("team registration", () => {
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

    it("should return error when createInbox throws", async () => {
      const result = await startSession(
        { branch: "feat/test", teamName: "my-team", agentName: "worker" },
        defaultDeps({
          teamRepo: {
            getLeadSessionId: async () => "session-123",
            registerMember: async () => {},
            createInbox: async () => {
              throw new Error("inbox creation failed");
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
