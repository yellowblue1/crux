import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import type { ClaudeProcess, ProcessInfo, TmuxPane } from "../types";
import { SessionManager, type SessionManagerDeps } from "./manager";

/**
 * Mock FSWatcher that allows triggering change events manually
 */
class MockFSWatcher {
  private callback: (() => void) | null = null;
  closed = false;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  /** Simulate a file change event */
  triggerChange(): void {
    this.callback?.();
  }

  close(): void {
    this.closed = true;
    this.callback = null;
  }
}

/**
 * Mock FIFO reader process that allows simulating pipe-pane output
 */
class MockFifoReader extends EventEmitter {
  stdout: EventEmitter = new EventEmitter();
  killed = false;

  kill(_signal?: string): boolean {
    this.killed = true;
    return true;
  }

  /** Simulate data arriving from pipe-pane */
  simulateData(data = "output"): void {
    this.stdout.emit("data", Buffer.from(data));
  }
}

function createMockDeps(overrides: Partial<SessionManagerDeps> = {}): {
  deps: SessionManagerDeps;
  watchers: Map<string, MockFSWatcher>;
  fifoReaders: Map<string, MockFifoReader>;
} {
  const defaultPanes: TmuxPane[] = [
    { pane_id: "%0", pane_pid: 1000, session_name: "main", window_index: 0, pane_index: 0 },
  ];
  const defaultProcesses: ClaudeProcess[] = [{ pid: 2000, ppid: 1000 }];
  const defaultProcessTable: ProcessInfo[] = [
    { pid: 1000, ppid: 1, command: "-bash" },
    { pid: 2000, ppid: 1000, command: "claude" },
  ];
  const watchers = new Map<string, MockFSWatcher>();
  const fifoReaders = new Map<string, MockFifoReader>();

  const deps: SessionManagerDeps = {
    isTmuxAvailable: () => true,
    getAllTmuxPanes: () => defaultPanes,
    getProcessTable: () => defaultProcessTable,
    getClaudeProcesses: () => defaultProcesses,
    getProcessCwd: () => "/home/user/project",
    getProjectName: () => "my-project",
    getGitBranch: () => "main",
    buildTmuxTarget: (pane) => `${pane.session_name}:${pane.window_index}.${pane.pane_index}`,
    matchProcessesToPanes: (processes, panes, _processTable) => {
      const paneByPid = new Map<number, TmuxPane>();
      for (const pane of panes) paneByPid.set(pane.pane_pid, pane);
      const result = new Map<string, { process: ClaudeProcess; pane: TmuxPane }>();
      for (const proc of processes) {
        const pane = paneByPid.get(proc.ppid);
        if (pane) result.set(pane.pane_id, { process: proc, pane });
      }
      return result;
    },
    findSessionJsonlPath: () => "/home/user/.claude/projects/test/session.jsonl",
    extractJsonlConversation: () => "[user]: Help me fix a bug\n\n[assistant]: I'll help.",
    generateSummary: async () => null,
    watchFile: (path: string, callback: () => void) => {
      const watcher = new MockFSWatcher(callback);
      watchers.set(path, watcher);
      return watcher as unknown as FSWatcher;
    },
    capturePaneContent: () => null,
    startPipePane: () => true,
    stopPipePane: () => true,
    createFifo: () => true,
    spawnFifoReader: (path: string) => {
      const reader = new MockFifoReader();
      fifoReaders.set(path, reader);
      return reader as unknown as ChildProcess;
    },
    ...overrides,
  };

  return { deps, watchers, fifoReaders };
}

describe("SessionManager", () => {
  let manager: SessionManager;

  afterEach(() => {
    manager?.stop();
  });

  describe("getSessions", () => {
    it("returns empty array when no sessions detected", () => {
      const { deps } = createMockDeps({
        getClaudeProcesses: () => [],
      });
      manager = new SessionManager(deps);
      manager.start();
      expect(manager.getSessions()).toEqual([]);
    });

    it("detects a claude session from tmux pane", () => {
      const { deps } = createMockDeps();
      manager = new SessionManager(deps);
      manager.start();

      const sessions = manager.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].pane_id).toBe("%0");
      expect(sessions[0].project_name).toBe("my-project");
      expect(sessions[0].git_branch).toBe("main");
      expect(sessions[0].status).toBe("busy");
      expect(sessions[0].tmux_target).toBe("main:0.0");
    });
  });

  describe("idle detection via fs.watch", () => {
    it("marks session as WAITING after idle threshold", async () => {
      const { deps } = createMockDeps();
      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 100,
      });
      manager.start();

      // Initially BUSY
      expect(manager.getSessions()[0]?.status).toBe("busy");

      // Wait for idle threshold to expire
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should now be WAITING (no JSONL changes happened)
      expect(manager.getSessions()[0]?.status).toBe("waiting");
    });

    it("stays BUSY when JSONL file keeps changing", async () => {
      const { deps, watchers } = createMockDeps();
      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 200,
      });
      manager.start();

      // Simulate JSONL changes every 50ms (faster than idle threshold)
      const interval = setInterval(() => {
        const watcher = watchers.get("/home/user/.claude/projects/test/session.jsonl");
        watcher?.triggerChange();
      }, 50);

      await new Promise((resolve) => setTimeout(resolve, 400));
      clearInterval(interval);

      // Should still be BUSY because JSONL keeps updating
      expect(manager.getSessions()[0]?.status).toBe("busy");
    });

    it("transitions back to BUSY when JSONL changes after WAITING", async () => {
      const { deps, watchers } = createMockDeps();
      const onChangeSpy = mock(() => {});

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 100,
      });
      manager.onChange(onChangeSpy);
      manager.start();

      // Wait for idle
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(manager.getSessions()[0]?.status).toBe("waiting");

      // Simulate JSONL change (user starts typing)
      const watcher = watchers.get("/home/user/.claude/projects/test/session.jsonl");
      watcher?.triggerChange();

      // Should be back to BUSY
      expect(manager.getSessions()[0]?.status).toBe("busy");
      expect(manager.getSessions()[0]?.summary).toBeNull();
    });
  });

  describe("session removal", () => {
    it("removes sessions when process disappears", async () => {
      let hasProcess = true;
      const { deps } = createMockDeps({
        getClaudeProcesses: () => (hasProcess ? [{ pid: 2000, ppid: 1000 }] : []),
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      expect(manager.getSessions()).toHaveLength(1);

      // Remove the process
      hasProcess = false;
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(manager.getSessions()).toHaveLength(0);
    });

    it("closes watcher when session is removed", async () => {
      let hasProcess = true;
      const { deps, watchers } = createMockDeps({
        getClaudeProcesses: () => (hasProcess ? [{ pid: 2000, ppid: 1000 }] : []),
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      const watcher = watchers.get("/home/user/.claude/projects/test/session.jsonl");
      expect(watcher).toBeDefined();

      hasProcess = false;
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(watcher?.closed).toBe(true);
    });
  });

  describe("PID change detection", () => {
    it("recreates session when Claude process PID changes in same pane", async () => {
      let currentPid = 2000;
      const { deps } = createMockDeps({
        getClaudeProcesses: () => [{ pid: currentPid, ppid: 1000 }],
        getGitBranch: () => (currentPid === 2000 ? "feature-a" : "feature-b"),
        getProcessCwd: () =>
          currentPid === 2000 ? "/home/user/project-a" : "/home/user/project-b",
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      // Initial session
      expect(manager.getSessions()).toHaveLength(1);
      expect(manager.getSessions()[0].git_branch).toBe("feature-a");

      // Claude restarts with a different PID in the same pane
      currentPid = 3000;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Session should be recreated with fresh metadata
      const sessions = manager.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].git_branch).toBe("feature-b");
      expect(sessions[0].pane_id).toBe("%0");
    });

    it("fires onChange when PID changes", async () => {
      let currentPid = 2000;
      const onChangeSpy = mock(() => {});
      const { deps } = createMockDeps({
        getClaudeProcesses: () => [{ pid: currentPid, ppid: 1000 }],
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.onChange(onChangeSpy);
      manager.start();

      const initialCallCount = onChangeSpy.mock.calls.length;

      currentPid = 3000;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have fired at least once more for the PID change
      expect(onChangeSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it("restarts JSONL watcher when PID changes", async () => {
      let currentPid = 2000;
      let jsonlPath = "/home/user/.claude/projects/test/session-a.jsonl";
      const { deps, watchers } = createMockDeps({
        getClaudeProcesses: () => [{ pid: currentPid, ppid: 1000 }],
        findSessionJsonlPath: () => jsonlPath,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      const oldWatcher = watchers.get("/home/user/.claude/projects/test/session-a.jsonl");
      expect(oldWatcher).toBeDefined();

      // Change PID and JSONL path
      currentPid = 3000;
      jsonlPath = "/home/user/.claude/projects/test/session-b.jsonl";
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Old watcher should be closed
      expect(oldWatcher?.closed).toBe(true);
      // New watcher should be created
      const newWatcher = watchers.get("/home/user/.claude/projects/test/session-b.jsonl");
      expect(newWatcher).toBeDefined();
    });

    it("recreates session with fresh metadata when PID changes during WAITING", async () => {
      let currentPid = 2000;
      const { deps } = createMockDeps({
        getClaudeProcesses: () => [{ pid: currentPid, ppid: 1000 }],
        getGitBranch: () => (currentPid === 2000 ? "old-branch" : "new-branch"),
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 50,
        idleThresholdMs: 30,
      });
      manager.start();

      // Wait for WAITING status
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(manager.getSessions()[0]?.status).toBe("waiting");
      expect(manager.getSessions()[0]?.git_branch).toBe("old-branch");

      // PID change: new Claude starts
      currentPid = 3000;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Session should be recreated with fresh metadata
      expect(manager.getSessions()[0]?.git_branch).toBe("new-branch");
    });

    it("does not recreate session when PID remains the same", async () => {
      const getProcessCwdSpy = mock(() => "/home/user/project");
      const { deps } = createMockDeps({
        getProcessCwd: getProcessCwdSpy,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      const initialCallCount = getProcessCwdSpy.mock.calls.length;

      // Wait for several polls
      await new Promise((resolve) => setTimeout(resolve, 200));

      // getProcessCwd should not be called again (no recreation)
      expect(getProcessCwdSpy.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe("JSONL path retry", () => {
    it("retries finding JSONL path on subsequent polls when initially null", async () => {
      let jsonlAvailable = false;
      const findSessionJsonlPathSpy = mock(() =>
        jsonlAvailable ? "/home/user/.claude/projects/test/session.jsonl" : null,
      );

      const { deps, watchers } = createMockDeps({
        findSessionJsonlPath: findSessionJsonlPathSpy,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      // Session created with null JSONL path
      expect(manager.getSessions()).toHaveLength(1);
      expect(watchers.size).toBe(0); // No watcher since no JSONL path

      // JSONL becomes available
      jsonlAvailable = true;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have retried and found the JSONL path, setting up a watcher
      expect(watchers.size).toBe(1);
      expect(watchers.has("/home/user/.claude/projects/test/session.jsonl")).toBe(true);
    });

    it("generates summary after JSONL path is discovered on retry", async () => {
      let jsonlAvailable = false;
      const generateSpy = mock(async () => "Waiting for input");

      const { deps } = createMockDeps({
        findSessionJsonlPath: () =>
          jsonlAvailable ? "/home/user/.claude/projects/test/session.jsonl" : null,
        generateSummary: generateSpy,
        capturePaneContent: () => "static content",
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 50,
        idleThresholdMs: 30,
        summaryDelayMs: 5000,
        paneCheckIntervalMs: 30,
      });
      manager.start();

      // Initially no summary possible (no JSONL)
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(generateSpy).not.toHaveBeenCalled();

      // JSONL becomes available
      jsonlAvailable = true;
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should now be able to generate summary
      expect(generateSpy).toHaveBeenCalled();
    });

    it("does not retry when JSONL path is already set", async () => {
      const findSessionJsonlPathSpy = mock(() => "/home/user/.claude/projects/test/session.jsonl");

      const { deps } = createMockDeps({
        findSessionJsonlPath: findSessionJsonlPathSpy,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      const initialCallCount = findSessionJsonlPathSpy.mock.calls.length;

      // Wait for several polls
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should not have called findSessionJsonlPath again
      expect(findSessionJsonlPathSpy.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe("tmux unavailable", () => {
    it("returns empty sessions when tmux is not available", () => {
      const { deps } = createMockDeps({
        isTmuxAvailable: () => false,
      });
      manager = new SessionManager(deps);
      manager.start();
      expect(manager.getSessions()).toEqual([]);
    });
  });

  describe("getSession", () => {
    it("returns session by pane ID", () => {
      const { deps } = createMockDeps();
      manager = new SessionManager(deps);
      manager.start();

      const session = manager.getSession("%0");
      expect(session).not.toBeNull();
      expect(session?.pane_id).toBe("%0");
    });

    it("returns null for unknown pane ID", () => {
      const { deps } = createMockDeps();
      manager = new SessionManager(deps);
      manager.start();

      expect(manager.getSession("%99")).toBeNull();
    });
  });

  describe("onChange callback", () => {
    it("fires when new session is discovered", () => {
      const onChangeSpy = mock(() => {});
      const { deps } = createMockDeps();
      manager = new SessionManager(deps);
      manager.onChange(onChangeSpy);
      manager.start();

      expect(onChangeSpy).toHaveBeenCalled();
    });

    it("fires when session is removed", async () => {
      const onChangeSpy = mock(() => {});
      let hasProcess = true;

      const { deps } = createMockDeps({
        getClaudeProcesses: () => (hasProcess ? [{ pid: 2000, ppid: 1000 }] : []),
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.onChange(onChangeSpy);
      manager.start();

      hasProcess = false;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have been called at least twice: once for discovery, once for removal
      expect(onChangeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("fires when session transitions to WAITING", async () => {
      const onChangeSpy = mock(() => {});
      const { deps } = createMockDeps();

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 100,
      });
      manager.onChange(onChangeSpy);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Called for: discovery + waiting transition
      expect(onChangeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("summary generation (sustained WAITING)", () => {
    it("triggers summary only after sustained WAITING period", async () => {
      const generateSpy = mock(async () => "Waiting for user approval");

      const { deps } = createMockDeps({
        generateSummary: generateSpy,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 150,
      });
      manager.start();

      // After idle threshold (50ms): WAITING but no Gemini call yet
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(manager.getSessions()[0]?.status).toBe("waiting");
      expect(generateSpy).not.toHaveBeenCalled();

      // After summary delay (50 + 150 = 200ms total): Gemini called
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(manager.getSessions()[0]?.summary).toBe("Waiting for user approval");
    });

    it("cancels summary when session goes BUSY before delay fires", async () => {
      const generateSpy = mock(async () => "Should not appear");

      const { deps, watchers } = createMockDeps({
        generateSummary: generateSpy,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 200,
      });
      manager.start();

      // Wait for WAITING (50ms idle threshold)
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(manager.getSessions()[0]?.status).toBe("waiting");

      // Go BUSY before summary delay fires (at ~100ms, delay hasn't fired at 50+200=250ms)
      const watcher = watchers.get("/home/user/.claude/projects/test/session.jsonl");
      watcher?.triggerChange();
      expect(manager.getSessions()[0]?.status).toBe("busy");

      // Wait past the original summary delay
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Gemini should NOT have been called — the timer was cancelled
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it("does not call Gemini during brief BUSY↔WAITING cycling", async () => {
      const generateSpy = mock(async () => "test");

      const { deps, watchers } = createMockDeps({
        generateSummary: generateSpy,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 30,
        summaryDelayMs: 200,
      });
      manager.start();

      // Rapid BUSY↔WAITING cycling: go idle, then active, repeat
      const watcher = watchers.get("/home/user/.claude/projects/test/session.jsonl");
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50)); // idle → WAITING
        watcher?.triggerChange(); // → BUSY (cancels summary timer)
      }

      // Wait past summary delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      // The final cycle left the session BUSY (last action was triggerChange),
      // then idle again. Only the LAST sustained WAITING should trigger Gemini.
      // But since we ended with triggerChange (BUSY) and then waited,
      // it should have triggered exactly once for the final sustained idle.
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });

    it("passes JSONL conversation to generateSummary", async () => {
      const conversationText = "[user]: Fix the bug\n\n[assistant]: Done.";
      const receivedContents: string[] = [];

      const { deps } = createMockDeps({
        extractJsonlConversation: () => conversationText,
        generateSummary: async (content) => {
          receivedContents.push(content);
          return "Fixed a bug";
        },
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 50,
      });
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(receivedContents).toHaveLength(1);
      expect(receivedContents[0]).toBe(conversationText);
    });

    it("does not generate summary when no JSONL path", async () => {
      const generateSpy = mock(async () => "test");

      const { deps } = createMockDeps({
        findSessionJsonlPath: () => null,
        generateSummary: generateSpy,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 50,
      });
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(generateSpy).not.toHaveBeenCalled();
    });
  });

  describe("dual-condition idle detection (pane diff + JSONL idle)", () => {
    it("triggers summary immediately when pane is static and session is WAITING", async () => {
      const generateSpy = mock(async () => "Waiting for approval");

      const { deps } = createMockDeps({
        generateSummary: generateSpy,
        capturePaneContent: () => "static pane content",
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 5000, // Intentionally long — should NOT be needed
        paneCheckIntervalMs: 30,
      });
      manager.start();

      // Wait for: idle threshold (50ms) + pane checks to detect static (2x30ms)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Summary should have been triggered via pane check, NOT the 5s delay
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(manager.getSessions()[0]?.summary).toBe("Waiting for approval");
    });

    it("does not trigger immediate summary when pane content is changing", async () => {
      const generateSpy = mock(async () => "test");
      let callCount = 0;

      const { deps } = createMockDeps({
        generateSummary: generateSpy,
        capturePaneContent: () => `pane content ${callCount++}`,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 5000,
        paneCheckIntervalMs: 30,
      });
      manager.start();

      // Wait well past idle threshold but not near summaryDelay
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Pane content keeps changing, so dual-condition not met — no immediate trigger
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it("falls back to summaryDelay when capturePaneContent returns null", async () => {
      const generateSpy = mock(async () => "Fallback summary");

      const { deps } = createMockDeps({
        generateSummary: generateSpy,
        capturePaneContent: () => null,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 150,
        paneCheckIntervalMs: 30,
      });
      manager.start();

      // After idle threshold but before summaryDelay: no summary yet
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(generateSpy).not.toHaveBeenCalled();

      // After summaryDelay fires: summary generated via fallback
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });

    it("does not trigger on first pane check (previousPaneContent is null)", async () => {
      const generateSpy = mock(async () => "test");
      let firstCall = true;

      const { deps } = createMockDeps({
        generateSummary: generateSpy,
        // Return same content but first capture should not count as "static"
        capturePaneContent: () => {
          if (firstCall) {
            firstCall = false;
            return "initial content";
          }
          // Return different content after first call to prevent trigger
          return `changing ${Date.now()}`;
        },
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 5000,
        paneCheckIntervalMs: 30,
      });
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should NOT have triggered — first check has null previousPaneContent,
      // and subsequent checks return different content
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it("cancels summary timer when pane check triggers early", async () => {
      const generateSpy = mock(async () => "Early trigger");

      const { deps } = createMockDeps({
        generateSummary: generateSpy,
        capturePaneContent: () => "static content",
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        summaryDelayMs: 300,
        paneCheckIntervalMs: 30,
      });
      manager.start();

      // Wait for pane check to trigger (well before summaryDelay of 300ms)
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(generateSpy).toHaveBeenCalledTimes(1);

      // Wait past summaryDelay — should NOT trigger again
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("pane-based BUSY detection (pane content change triggers WAITING → BUSY)", () => {
    it("transitions from WAITING to BUSY when pane content changes", async () => {
      let paneContent = "initial content";
      const { deps } = createMockDeps({
        capturePaneContent: () => paneContent,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 200,
        paneCheckIntervalMs: 30,
        summaryDelayMs: 5000,
      });
      manager.start();

      // Wait for idle threshold to expire → WAITING
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(manager.getSessions()[0]?.status).toBe("waiting");

      // Simulate pane content change (Claude is thinking)
      paneContent = "thinking... spinner frame 1";
      // Wait for pane check to detect change, but less than idleThresholdMs (200ms)
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(manager.getSessions()[0]?.status).toBe("busy");
    });

    it("clears summary when pane content change triggers BUSY", async () => {
      let paneContent = "static content";
      const generateSpy = mock(async () => "Some summary");

      const { deps } = createMockDeps({
        capturePaneContent: () => paneContent,
        generateSummary: generateSpy,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 200,
        paneCheckIntervalMs: 30,
        summaryDelayMs: 5000,
      });
      manager.start();

      // Wait for WAITING + pane static → summary generation
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(manager.getSessions()[0]?.status).toBe("waiting");
      expect(manager.getSessions()[0]?.summary).toBe("Some summary");

      // Pane content changes → should clear summary
      paneContent = "new output from claude";
      // Wait for pane check to detect change, but less than idleThresholdMs (200ms)
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(manager.getSessions()[0]?.status).toBe("busy");
      expect(manager.getSessions()[0]?.summary).toBeNull();
    });

    it("fires onChange when pane content change triggers WAITING → BUSY", async () => {
      let paneContent = "initial";
      const onChangeSpy = mock(() => {});

      const { deps } = createMockDeps({
        capturePaneContent: () => paneContent,
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 200,
        paneCheckIntervalMs: 30,
        summaryDelayMs: 5000,
      });
      manager.onChange(onChangeSpy);
      manager.start();

      // Wait for WAITING
      await new Promise((resolve) => setTimeout(resolve, 300));
      const countAfterWaiting = onChangeSpy.mock.calls.length;

      // Pane content changes
      paneContent = "changed content";
      // Wait for pane check to detect change, but less than idleThresholdMs (200ms)
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(onChangeSpy.mock.calls.length).toBeGreaterThan(countAfterWaiting);
    });

    it("does not transition to BUSY when pane content is static", async () => {
      const { deps } = createMockDeps({
        capturePaneContent: () => "always the same",
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        paneCheckIntervalMs: 30,
        summaryDelayMs: 5000,
      });
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(manager.getSessions()[0]?.status).toBe("waiting");
    });

    it("does not false-trigger BUSY on first pane capture", async () => {
      const { deps } = createMockDeps({
        capturePaneContent: () => "some content",
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        paneCheckIntervalMs: 30,
        summaryDelayMs: 5000,
      });
      manager.start();

      // First capture has null previousPaneContent — should not trigger BUSY
      // Session should still proceed to WAITING via idle timer
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(manager.getSessions()[0]?.status).toBe("waiting");
    });
  });

  describe("stop", () => {
    it("closes all watchers on stop", () => {
      const { deps, watchers } = createMockDeps();
      manager = new SessionManager(deps);
      manager.start();

      const watcher = watchers.get("/home/user/.claude/projects/test/session.jsonl");
      expect(watcher).toBeDefined();

      manager.stop();
      expect(watcher?.closed).toBe(true);
    });
  });

  describe("pipe-pane activity detection", () => {
    it("sets up pipe-pane on session creation", () => {
      const createFifoSpy = mock(() => true);
      const startPipePaneSpy = mock(() => true);

      const { deps } = createMockDeps({
        createFifo: createFifoSpy,
        startPipePane: startPipePaneSpy,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 5000 });
      manager.start();

      expect(createFifoSpy).toHaveBeenCalledTimes(1);
      expect(startPipePaneSpy).toHaveBeenCalledTimes(1);
    });

    it("transitions from WAITING to BUSY when pipe-pane receives data", async () => {
      const { deps, fifoReaders } = createMockDeps();

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        paneCheckIntervalMs: 5000, // Disable pane polling (long interval)
      });
      manager.start();

      // Wait for WAITING
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(manager.getSessions()[0]?.status).toBe("waiting");

      // Simulate pipe-pane data
      const reader = Array.from(fifoReaders.values())[0];
      reader?.simulateData("some output");

      // Should transition to BUSY immediately
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(manager.getSessions()[0]?.status).toBe("busy");
    });

    it("clears summary when pipe-pane activity triggers BUSY", async () => {
      const generateSpy = mock(async () => "Some summary");

      const { deps, fifoReaders } = createMockDeps({
        generateSummary: generateSpy,
        capturePaneContent: () => "static content",
      });

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        paneCheckIntervalMs: 30,
        summaryDelayMs: 5000,
      });
      manager.start();

      // Wait for WAITING + static pane → summary generated
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(manager.getSessions()[0]?.status).toBe("waiting");
      expect(manager.getSessions()[0]?.summary).toBe("Some summary");

      // Pipe-pane data → BUSY, summary cleared
      const reader = Array.from(fifoReaders.values())[0];
      reader?.simulateData("new output");

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(manager.getSessions()[0]?.status).toBe("busy");
      expect(manager.getSessions()[0]?.summary).toBeNull();
    });

    it("fires onChange when pipe-pane triggers WAITING → BUSY", async () => {
      const onChangeSpy = mock(() => {});

      const { deps, fifoReaders } = createMockDeps();

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 50,
        paneCheckIntervalMs: 5000,
      });
      manager.onChange(onChangeSpy);
      manager.start();

      // Wait for WAITING
      await new Promise((resolve) => setTimeout(resolve, 100));
      const countAfterWaiting = onChangeSpy.mock.calls.length;

      // Pipe-pane data
      const reader = Array.from(fifoReaders.values())[0];
      reader?.simulateData("output");

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onChangeSpy.mock.calls.length).toBeGreaterThan(countAfterWaiting);
    });

    it("tears down pipe-pane on session removal", async () => {
      let hasProcess = true;
      const stopPipePaneSpy = mock(() => true);

      const { deps, fifoReaders } = createMockDeps({
        getClaudeProcesses: () => (hasProcess ? [{ pid: 2000, ppid: 1000 }] : []),
        stopPipePane: stopPipePaneSpy,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      expect(fifoReaders.size).toBe(1);
      const reader = Array.from(fifoReaders.values())[0];

      // Remove process
      hasProcess = false;
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(stopPipePaneSpy).toHaveBeenCalled();
      expect(reader?.killed).toBe(true);
    });

    it("tears down pipe-pane on stop", () => {
      const stopPipePaneSpy = mock(() => true);

      const { deps, fifoReaders } = createMockDeps({
        stopPipePane: stopPipePaneSpy,
      });

      manager = new SessionManager(deps);
      manager.start();

      const reader = Array.from(fifoReaders.values())[0];

      manager.stop();

      expect(stopPipePaneSpy).toHaveBeenCalled();
      expect(reader?.killed).toBe(true);
    });

    it("falls back gracefully when FIFO creation fails", () => {
      const { deps } = createMockDeps({
        createFifo: () => false,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 5000 });
      manager.start();

      // Session should still be created
      expect(manager.getSessions()).toHaveLength(1);
      expect(manager.getSessions()[0]?.status).toBe("busy");
    });

    it("falls back gracefully when startPipePane fails", () => {
      const stopPipePaneSpy = mock(() => true);

      const { deps } = createMockDeps({
        startPipePane: () => false,
        stopPipePane: stopPipePaneSpy,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 5000 });
      manager.start();

      // Session should still be created
      expect(manager.getSessions()).toHaveLength(1);
      // Cleanup should have been attempted
      expect(stopPipePaneSpy).toHaveBeenCalled();
    });

    it("recreates pipe-pane when PID changes", async () => {
      let currentPid = 2000;
      const createFifoSpy = mock(() => true);

      const { deps, fifoReaders } = createMockDeps({
        getClaudeProcesses: () => [{ pid: currentPid, ppid: 1000 }],
        createFifo: createFifoSpy,
      });

      manager = new SessionManager(deps, { pollIntervalMs: 50 });
      manager.start();

      expect(createFifoSpy).toHaveBeenCalledTimes(1);
      const oldReader = Array.from(fifoReaders.values())[0];

      // PID changes
      currentPid = 3000;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Old reader should be killed, new one created
      expect(oldReader?.killed).toBe(true);
      expect(createFifoSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("does not transition when pipe-pane data arrives during BUSY", async () => {
      const onChangeSpy = mock(() => {});

      const { deps, fifoReaders } = createMockDeps();

      manager = new SessionManager(deps, {
        pollIntervalMs: 5000,
        idleThresholdMs: 5000, // Keep BUSY for a long time
      });
      manager.onChange(onChangeSpy);
      manager.start();

      // Session starts BUSY
      expect(manager.getSessions()[0]?.status).toBe("busy");
      const countAfterCreate = onChangeSpy.mock.calls.length;

      // Pipe-pane data while BUSY — should not trigger onChange
      const reader = Array.from(fifoReaders.values())[0];
      reader?.simulateData("output");

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(manager.getSessions()[0]?.status).toBe("busy");
      expect(onChangeSpy.mock.calls.length).toBe(countAfterCreate);
    });
  });
});
