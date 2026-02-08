import { describe, expect, it } from "bun:test";
import type { ClaudeProcess, TmuxPane } from "../types";
import {
  buildTmuxTarget,
  encodeCwdPath,
  extractJsonlConversation,
  findSessionJsonlPath,
  getAllTmuxPanes,
  getClaudeProcesses,
  getGitBranch,
  getProcessCwd,
  getProjectName,
  isTmuxAvailable,
  matchProcessesToPanes,
  switchToPane,
} from "./utils";

describe("isTmuxAvailable", () => {
  it("returns true when tmux list-sessions succeeds", () => {
    const exec = () => "session1: 1 windows";
    expect(isTmuxAvailable(exec)).toBe(true);
  });

  it("returns false when tmux is not available", () => {
    const exec = () => {
      throw new Error("tmux not found");
    };
    expect(isTmuxAvailable(exec)).toBe(false);
  });
});

describe("getAllTmuxPanes", () => {
  it("parses tmux list-panes output correctly", () => {
    const exec = () => "%0 1234 main 0 0\n%1 5678 work 1 0\n%2 9012 work 1 1";
    const panes = getAllTmuxPanes(exec);

    expect(panes).toHaveLength(3);
    expect(panes[0]).toEqual({
      pane_id: "%0",
      pane_pid: 1234,
      session_name: "main",
      window_index: 0,
      pane_index: 0,
    });
    expect(panes[1]).toEqual({
      pane_id: "%1",
      pane_pid: 5678,
      session_name: "work",
      window_index: 1,
      pane_index: 0,
    });
  });

  it("returns empty array when tmux fails", () => {
    const exec = () => {
      throw new Error("tmux error");
    };
    expect(getAllTmuxPanes(exec)).toEqual([]);
  });

  it("skips malformed lines", () => {
    const exec = () => "%0 1234 main 0 0\nbadline\n%1 5678 work 1 0";
    const panes = getAllTmuxPanes(exec);
    expect(panes).toHaveLength(2);
  });

  it("handles empty output", () => {
    const exec = () => "";
    expect(getAllTmuxPanes(exec)).toEqual([]);
  });
});

describe("getClaudeProcesses", () => {
  it("parses ps output and filters claude processes", () => {
    const exec = () =>
      [
        "  PID  PPID COMMAND",
        "  100  1234 claude",
        "  200  5678 claude --resume",
        "  300  9012 vim",
        "  400  3456 node server.js",
      ].join("\n");

    const processes = getClaudeProcesses(exec);
    expect(processes).toHaveLength(2);
    expect(processes[0]).toEqual({ pid: 100, ppid: 1234 });
    expect(processes[1]).toEqual({ pid: 200, ppid: 5678 });
  });

  it("filters out grep processes", () => {
    const exec = () =>
      ["  PID  PPID COMMAND", "  100  1234 claude", "  500  9999 grep claude"].join("\n");

    const processes = getClaudeProcesses(exec);
    expect(processes).toHaveLength(1);
    expect(processes[0].pid).toBe(100);
  });

  it("returns empty array on failure", () => {
    const exec = () => {
      throw new Error("ps failed");
    };
    expect(getClaudeProcesses(exec)).toEqual([]);
  });
});

describe("getProcessCwd", () => {
  it("parses lsof output for cwd", () => {
    const exec = () => "p1234\nfcwd\nn/Users/test/project";
    expect(getProcessCwd(1234, exec)).toBe("/Users/test/project");
  });

  it("returns null on failure", () => {
    const exec = () => {
      throw new Error("lsof failed");
    };
    expect(getProcessCwd(1234, exec)).toBeNull();
  });

  it("returns null when no cwd line found", () => {
    const exec = () => "p1234\nfother\n";
    expect(getProcessCwd(1234, exec)).toBeNull();
  });
});

describe("getProjectName", () => {
  it("extracts repo name from SSH remote URL", () => {
    const exec = () => "git@github.com:user/my-repo.git";
    expect(getProjectName("/some/path", exec)).toBe("my-repo");
  });

  it("extracts repo name from HTTPS remote URL", () => {
    const exec = () => "https://github.com/user/my-repo.git";
    expect(getProjectName("/some/path", exec)).toBe("my-repo");
  });

  it("falls back to basename of cwd on failure", () => {
    const exec = () => {
      throw new Error("not a git repo");
    };
    expect(getProjectName("/Users/test/my-project", exec)).toBe("my-project");
  });
});

describe("getGitBranch", () => {
  it("returns branch name", () => {
    const exec = () => "feat/my-feature";
    expect(getGitBranch("/some/path", exec)).toBe("feat/my-feature");
  });

  it("returns null on failure", () => {
    const exec = () => {
      throw new Error("not a git repo");
    };
    expect(getGitBranch("/some/path", exec)).toBeNull();
  });
});

describe("buildTmuxTarget", () => {
  it("formats session:window.pane", () => {
    const pane: TmuxPane = {
      pane_id: "%0",
      pane_pid: 1234,
      session_name: "main",
      window_index: 2,
      pane_index: 1,
    };
    expect(buildTmuxTarget(pane)).toBe("main:2.1");
  });
});

describe("switchToPane", () => {
  it("returns true on success", () => {
    const exec = () => "";
    expect(switchToPane("%0", exec)).toBe(true);
  });

  it("returns false on failure", () => {
    const exec = () => {
      throw new Error("tmux error");
    };
    expect(switchToPane("%0", exec)).toBe(false);
  });
});

describe("matchProcessesToPanes", () => {
  it("matches claude process PPID to pane PID", () => {
    const processes: ClaudeProcess[] = [
      { pid: 100, ppid: 1234 },
      { pid: 200, ppid: 5678 },
    ];
    const panes: TmuxPane[] = [
      { pane_id: "%0", pane_pid: 1234, session_name: "main", window_index: 0, pane_index: 0 },
      { pane_id: "%1", pane_pid: 9999, session_name: "work", window_index: 1, pane_index: 0 },
    ];

    const result = matchProcessesToPanes(processes, panes);
    expect(result.size).toBe(1);
    expect(result.has("%0")).toBe(true);
    expect(result.get("%0")?.process.pid).toBe(100);
    expect(result.get("%0")?.pane.pane_id).toBe("%0");
  });

  it("returns empty map when no matches", () => {
    const processes: ClaudeProcess[] = [{ pid: 100, ppid: 9999 }];
    const panes: TmuxPane[] = [
      { pane_id: "%0", pane_pid: 1234, session_name: "main", window_index: 0, pane_index: 0 },
    ];

    const result = matchProcessesToPanes(processes, panes);
    expect(result.size).toBe(0);
  });

  it("handles empty inputs", () => {
    expect(matchProcessesToPanes([], []).size).toBe(0);
  });
});

describe("encodeCwdPath", () => {
  it("encodes slashes to dashes", () => {
    expect(encodeCwdPath("/Users/test/project")).toBe("-Users-test-project");
  });

  it("encodes dots to dashes", () => {
    expect(encodeCwdPath("/Users/test/my.project")).toBe("-Users-test-my-project");
  });

  it("handles complex paths", () => {
    expect(encodeCwdPath("/Users/akirasosa/ghq/github.com/yellowblue1/crux")).toBe(
      "-Users-akirasosa-ghq-github-com-yellowblue1-crux",
    );
  });
});

describe("findSessionJsonlPath", () => {
  it("returns null for non-existent directory", () => {
    expect(findSessionJsonlPath("/nonexistent/path/that/surely/does/not/exist")).toBeNull();
  });
});

describe("extractJsonlConversation", () => {
  it("returns null for non-existent file", () => {
    expect(extractJsonlConversation("/nonexistent/file.jsonl")).toBeNull();
  });

  it("extracts text from user and assistant messages", () => {
    const { writeFileSync, mkdtempSync, rmSync } = require("node:fs");
    const { join } = require("node:path");
    const { tmpdir } = require("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "crux-test-"));
    const jsonlPath = join(tmpDir, "test.jsonl");

    try {
      const lines = [
        JSON.stringify({ type: "progress", data: {} }),
        JSON.stringify({ type: "user", message: { content: "Hello, help me fix a bug" } }),
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I'll help you fix that bug." }],
          },
        }),
        JSON.stringify({ type: "progress", data: {} }),
        JSON.stringify({
          type: "user",
          message: {
            content: [{ type: "tool_result" }],
          },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "The fix is ready." },
              { type: "tool_use", name: "write" },
            ],
          },
        }),
      ];
      writeFileSync(jsonlPath, lines.join("\n"));

      const result = extractJsonlConversation(jsonlPath);
      expect(result).not.toBeNull();
      expect(result).toContain("[user]: Hello, help me fix a bug");
      expect(result).toContain("[assistant]: I'll help you fix that bug.");
      expect(result).toContain("[assistant]: The fix is ready.");
      // tool_result-only messages should be excluded (no text content)
      expect(result).not.toContain("tool_result");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("handles empty JSONL file", () => {
    const { writeFileSync, mkdtempSync, rmSync } = require("node:fs");
    const { join } = require("node:path");
    const { tmpdir } = require("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "crux-test-"));
    const jsonlPath = join(tmpDir, "empty.jsonl");

    try {
      writeFileSync(jsonlPath, "");
      expect(extractJsonlConversation(jsonlPath)).toBeNull();
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});
