import { describe, expect, it } from "bun:test";
import type { ClaudeProcess, ProcessInfo, TmuxPane } from "../types";
import {
  buildTmuxTarget,
  capturePaneContent,
  encodeCwdPath,
  extractJsonlConversation,
  findSessionJsonlPath,
  getAllTmuxPanes,
  getClaudeProcesses,
  getGitBranch,
  getJsonlMtime,
  getProcessCwd,
  getProcessTable,
  getProjectName,
  isClaudeBinary,
  isTmuxAvailable,
  matchProcessesToPanes,
  startPipePane,
  stopPipePane,
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

describe("isClaudeBinary", () => {
  it("matches bare claude command", () => {
    expect(isClaudeBinary("claude")).toBe(true);
  });

  it("matches claude with arguments", () => {
    expect(isClaudeBinary("claude --resume")).toBe(true);
    expect(isClaudeBinary("claude --agent-id worker@team --plan-mode")).toBe(true);
  });

  it("matches claude with full path", () => {
    expect(isClaudeBinary("/usr/local/bin/claude")).toBe(true);
    expect(isClaudeBinary("/opt/homebrew/bin/claude --resume")).toBe(true);
  });

  it("rejects Claude Desktop app (capital C)", () => {
    expect(isClaudeBinary("/Applications/Claude.app/Contents/MacOS/Claude")).toBe(false);
  });

  it("rejects processes with claude in path arguments", () => {
    expect(isClaudeBinary("nvim /Users/test/.claude/CLAUDE.md")).toBe(false);
    expect(isClaudeBinary("nvim --embed /Users/test/.claude/CLAUDE.md")).toBe(false);
  });

  it("rejects Claude Helper processes", () => {
    expect(
      isClaudeBinary(
        "/Applications/Claude.app/Contents/Frameworks/Claude Helper (GPU).app/Contents/MacOS/Claude Helper (GPU) --type=gpu-process",
      ),
    ).toBe(false);
  });

  it("rejects bun/node processes running claude-related scripts", () => {
    expect(isClaudeBinary("bun run /path/.claude/plugins/server.ts")).toBe(false);
    expect(isClaudeBinary("node /path/claude-code/index.js")).toBe(false);
  });

  it("rejects grep claude", () => {
    expect(isClaudeBinary("grep claude")).toBe(false);
  });
});

describe("getProcessTable", () => {
  it("parses ps output into ProcessInfo array", () => {
    const exec = () =>
      [
        "  PID  PPID COMMAND",
        "  100  1234 claude",
        "  200  5678 nvim /Users/test/.claude/CLAUDE.md",
        "  300     1 /Applications/Claude.app/Contents/MacOS/Claude",
      ].join("\n");

    const table = getProcessTable(exec);
    expect(table).toHaveLength(3);
    expect(table[0]).toEqual({ pid: 100, ppid: 1234, command: "claude" });
    expect(table[1]).toEqual({
      pid: 200,
      ppid: 5678,
      command: "nvim /Users/test/.claude/CLAUDE.md",
    });
    expect(table[2]).toEqual({
      pid: 300,
      ppid: 1,
      command: "/Applications/Claude.app/Contents/MacOS/Claude",
    });
  });

  it("returns empty array on failure", () => {
    const exec = () => {
      throw new Error("ps failed");
    };
    expect(getProcessTable(exec)).toEqual([]);
  });
});

describe("getClaudeProcesses", () => {
  it("filters only claude CLI binary from process table", () => {
    const processTable: ProcessInfo[] = [
      { pid: 100, ppid: 1234, command: "claude" },
      { pid: 200, ppid: 5678, command: "claude --resume" },
      { pid: 300, ppid: 9012, command: "vim" },
      { pid: 400, ppid: 3456, command: "node server.js" },
    ];

    const processes = getClaudeProcesses(processTable);
    expect(processes).toHaveLength(2);
    expect(processes[0]).toEqual({ pid: 100, ppid: 1234 });
    expect(processes[1]).toEqual({ pid: 200, ppid: 5678 });
  });

  it("filters out nvim editing .claude files", () => {
    const processTable: ProcessInfo[] = [
      { pid: 100, ppid: 1234, command: "claude" },
      { pid: 200, ppid: 2117, command: "nvim /Users/test/.claude/CLAUDE.md" },
      { pid: 300, ppid: 200, command: "nvim --embed /Users/test/.claude/CLAUDE.md" },
    ];

    const processes = getClaudeProcesses(processTable);
    expect(processes).toHaveLength(1);
    expect(processes[0].pid).toBe(100);
  });

  it("filters out Claude Desktop app and helpers", () => {
    const processTable: ProcessInfo[] = [
      { pid: 100, ppid: 1234, command: "claude" },
      { pid: 657, ppid: 1, command: "/Applications/Claude.app/Contents/MacOS/Claude" },
      {
        pid: 849,
        ppid: 657,
        command:
          "/Applications/Claude.app/Contents/Frameworks/Claude Helper (GPU).app/Contents/MacOS/Claude Helper (GPU) --type=gpu-process",
      },
    ];

    const processes = getClaudeProcesses(processTable);
    expect(processes).toHaveLength(1);
    expect(processes[0].pid).toBe(100);
  });

  it("returns empty array for empty table", () => {
    expect(getClaudeProcesses([])).toEqual([]);
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

describe("capturePaneContent", () => {
  it("returns captured pane output", () => {
    const exec = () => "line 1\nline 2\n❯ ";
    expect(capturePaneContent("%0", exec)).toBe("line 1\nline 2\n❯ ");
  });

  it("returns null on tmux error", () => {
    const exec = () => {
      throw new Error("tmux error");
    };
    expect(capturePaneContent("%0", exec)).toBeNull();
  });
});

describe("matchProcessesToPanes", () => {
  it("matches claude process whose direct parent is pane_pid", () => {
    const processes: ClaudeProcess[] = [{ pid: 100, ppid: 1234 }];
    const panes: TmuxPane[] = [
      { pane_id: "%0", pane_pid: 1234, session_name: "main", window_index: 0, pane_index: 0 },
    ];
    const processTable: ProcessInfo[] = [
      { pid: 1234, ppid: 1, command: "-bash" },
      { pid: 100, ppid: 1234, command: "claude" },
    ];

    const result = matchProcessesToPanes(processes, panes, processTable);
    expect(result.size).toBe(1);
    expect(result.has("%0")).toBe(true);
    expect(result.get("%0")?.process.pid).toBe(100);
    expect(result.get("%0")?.pane.pane_id).toBe("%0");
  });

  it("matches claude through intermediate processes (ancestor walk)", () => {
    // shell (pane_pid=1000) → bun (pid=1500) → claude (pid=2000)
    const processes: ClaudeProcess[] = [{ pid: 2000, ppid: 1500 }];
    const panes: TmuxPane[] = [
      { pane_id: "%0", pane_pid: 1000, session_name: "main", window_index: 0, pane_index: 0 },
    ];
    const processTable: ProcessInfo[] = [
      { pid: 1000, ppid: 1, command: "-bash" },
      { pid: 1500, ppid: 1000, command: "bun run launcher.ts" },
      { pid: 2000, ppid: 1500, command: "claude --agent-id worker" },
    ];

    const result = matchProcessesToPanes(processes, panes, processTable);
    expect(result.size).toBe(1);
    expect(result.has("%0")).toBe(true);
    expect(result.get("%0")?.process.pid).toBe(2000);
  });

  it("matches multiple claude sessions to different panes", () => {
    const processes: ClaudeProcess[] = [
      { pid: 100, ppid: 1234 },
      { pid: 200, ppid: 5678 },
    ];
    const panes: TmuxPane[] = [
      { pane_id: "%0", pane_pid: 1234, session_name: "main", window_index: 0, pane_index: 0 },
      { pane_id: "%1", pane_pid: 5678, session_name: "work", window_index: 1, pane_index: 0 },
    ];
    const processTable: ProcessInfo[] = [
      { pid: 1234, ppid: 1, command: "-bash" },
      { pid: 5678, ppid: 1, command: "-bash" },
      { pid: 100, ppid: 1234, command: "claude" },
      { pid: 200, ppid: 5678, command: "claude" },
    ];

    const result = matchProcessesToPanes(processes, panes, processTable);
    expect(result.size).toBe(2);
    expect(result.has("%0")).toBe(true);
    expect(result.has("%1")).toBe(true);
  });

  it("returns empty map when no matches", () => {
    const processes: ClaudeProcess[] = [{ pid: 100, ppid: 9999 }];
    const panes: TmuxPane[] = [
      { pane_id: "%0", pane_pid: 1234, session_name: "main", window_index: 0, pane_index: 0 },
    ];
    const processTable: ProcessInfo[] = [
      { pid: 1234, ppid: 1, command: "-bash" },
      { pid: 9999, ppid: 1, command: "unrelated" },
      { pid: 100, ppid: 9999, command: "claude" },
    ];

    const result = matchProcessesToPanes(processes, panes, processTable);
    expect(result.size).toBe(0);
  });

  it("handles empty inputs", () => {
    expect(matchProcessesToPanes([], [], []).size).toBe(0);
  });

  it("works with empty process table (falls back to no match)", () => {
    const processes: ClaudeProcess[] = [{ pid: 100, ppid: 1234 }];
    const panes: TmuxPane[] = [
      { pane_id: "%0", pane_pid: 1234, session_name: "main", window_index: 0, pane_index: 0 },
    ];

    // With empty processTable, direct PPID match still works via paneByPid check
    const result = matchProcessesToPanes(processes, panes, []);
    expect(result.size).toBe(1);
    expect(result.has("%0")).toBe(true);
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

describe("startPipePane", () => {
  it("calls tmux pipe-pane with output-only flag", () => {
    let executedCommand = "";
    const exec = (cmd: string) => {
      executedCommand = cmd;
      return "";
    };

    const result = startPipePane("%0", "/tmp/test.fifo", exec);
    expect(result).toBe(true);
    expect(executedCommand).toContain("tmux pipe-pane -o");
    expect(executedCommand).toContain("%0");
    expect(executedCommand).toContain("/tmp/test.fifo");
  });

  it("returns false on failure", () => {
    const exec = () => {
      throw new Error("pane not found");
    };

    expect(startPipePane("%99", "/tmp/test.fifo", exec)).toBe(false);
  });
});

describe("stopPipePane", () => {
  it("calls tmux pipe-pane with no command to cancel", () => {
    let executedCommand = "";
    const exec = (cmd: string) => {
      executedCommand = cmd;
      return "";
    };

    const result = stopPipePane("%0", exec);
    expect(result).toBe(true);
    expect(executedCommand).toContain("tmux pipe-pane");
    expect(executedCommand).toContain("%0");
    // Should NOT contain -o (no output flag when cancelling)
    expect(executedCommand).not.toContain("-o");
  });

  it("returns false on failure", () => {
    const exec = () => {
      throw new Error("pane not found");
    };

    expect(stopPipePane("%99", exec)).toBe(false);
  });
});

describe("getJsonlMtime", () => {
  it("returns mtime for existing file", () => {
    // Test with the test file itself (it exists)
    const mtime = getJsonlMtime(import.meta.path);
    expect(mtime).toBeNumber();
    expect(mtime).toBeGreaterThan(0);
  });

  it("returns null for non-existent file", () => {
    expect(getJsonlMtime("/nonexistent/path/file.jsonl")).toBeNull();
  });
});
