import type { ChildProcess } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tmux from "../tmux/utils.js";
import type { ClaudeProcess, ProcessInfo, SessionResponse, SessionState, TmuxPane } from "../types";

/**
 * Dependencies for the SessionManager.
 * All external operations are injected to enable testing.
 */
export interface SessionManagerDeps {
  isTmuxAvailable: () => boolean;
  getAllTmuxPanes: () => TmuxPane[];
  getProcessTable: () => ProcessInfo[];
  getClaudeProcesses: (processTable: ProcessInfo[]) => ClaudeProcess[];
  getProcessCwd: (pid: number) => string | null;
  getProjectName: (cwd: string) => string;
  getGitBranch: (cwd: string) => string | null;
  buildTmuxTarget: (pane: TmuxPane) => string;
  matchProcessesToPanes: (
    processes: ClaudeProcess[],
    panes: TmuxPane[],
    processTable: ProcessInfo[],
  ) => Map<string, { process: ClaudeProcess; pane: TmuxPane }>;
  findSessionJsonlPath: (cwd: string) => string | null;
  extractJsonlConversation: (jsonlPath: string) => string | null;
  generateSummary: (content: string) => Promise<string | null>;
  getJsonlMtime: (jsonlPath: string) => number | null;
  capturePaneContent: (paneId: string) => string | null;
  startPipePane: (paneId: string, target: string) => boolean;
  stopPipePane: (paneId: string) => boolean;
  createFifo: (path: string) => boolean;
  spawnFifoReader: (path: string) => ChildProcess;
}

export interface SessionManagerOptions {
  pollIntervalMs?: number;
  idleThresholdMs?: number;
  summaryDelayMs?: number;
  paneCheckIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_IDLE_THRESHOLD_MS = 3000;
const DEFAULT_SUMMARY_DELAY_MS = 10_000; // 10 seconds of sustained WAITING (fallback)
const DEFAULT_PANE_CHECK_INTERVAL_MS = 1000; // 1 second pane diff polling

/** State for a single FIFO-based pipe-pane monitor */
interface PipePaneState {
  fifoPath: string;
  readerProcess: ChildProcess;
}

/**
 * Manages Claude Code session state via tmux polling + pipe-pane activity detection.
 *
 * Session discovery: polls ps + tmux list-panes periodically.
 * Status detection: pipe-pane (FIFO) is the sole signal for both directions:
 *   - WAITING → BUSY: any data on the pipe
 *   - BUSY → WAITING: no pipe data for idleThresholdMs
 * Falls back to capture-pane polling when pipe-pane is unavailable.
 * Summary generation: dual-condition — when WAITING AND tmux pane content is
 * static (unchanged between consecutive captures), triggers Gemini immediately.
 * Falls back to summaryDelayMs timeout if capture-pane is unavailable.
 * JSONL mtime guard prevents redundant Gemini calls when content hasn't changed.
 */
export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private summaryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pipePanes = new Map<string, PipePaneState>();
  private deps: SessionManagerDeps;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private paneCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pollIntervalMs: number;
  private readonly idleThresholdMs: number;
  private readonly summaryDelayMs: number;
  private readonly paneCheckIntervalMs: number;
  private onChangeCallback: (() => void) | null = null;

  constructor(deps?: Partial<SessionManagerDeps>, options?: SessionManagerOptions) {
    this.deps = {
      isTmuxAvailable: deps?.isTmuxAvailable ?? tmux.isTmuxAvailable,
      getAllTmuxPanes: deps?.getAllTmuxPanes ?? tmux.getAllTmuxPanes,
      getProcessTable: deps?.getProcessTable ?? tmux.getProcessTable,
      getClaudeProcesses: deps?.getClaudeProcesses ?? tmux.getClaudeProcesses,
      getProcessCwd: deps?.getProcessCwd ?? tmux.getProcessCwd,
      getProjectName: deps?.getProjectName ?? tmux.getProjectName,
      getGitBranch: deps?.getGitBranch ?? tmux.getGitBranch,
      buildTmuxTarget: deps?.buildTmuxTarget ?? tmux.buildTmuxTarget,
      matchProcessesToPanes: deps?.matchProcessesToPanes ?? tmux.matchProcessesToPanes,
      findSessionJsonlPath: deps?.findSessionJsonlPath ?? tmux.findSessionJsonlPath,
      extractJsonlConversation: deps?.extractJsonlConversation ?? tmux.extractJsonlConversation,
      generateSummary: deps?.generateSummary ?? (async () => null),
      getJsonlMtime: deps?.getJsonlMtime ?? tmux.getJsonlMtime,
      capturePaneContent: deps?.capturePaneContent ?? tmux.capturePaneContent,
      startPipePane: deps?.startPipePane ?? tmux.startPipePane,
      stopPipePane: deps?.stopPipePane ?? tmux.stopPipePane,
      createFifo: deps?.createFifo ?? defaultCreateFifo,
      spawnFifoReader: deps?.spawnFifoReader ?? defaultSpawnFifoReader,
    };
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.idleThresholdMs = options?.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
    this.summaryDelayMs = options?.summaryDelayMs ?? DEFAULT_SUMMARY_DELAY_MS;
    this.paneCheckIntervalMs = options?.paneCheckIntervalMs ?? DEFAULT_PANE_CHECK_INTERVAL_MS;
  }

  /**
   * Register a callback to be notified when session state changes
   */
  onChange(callback: () => void): void {
    this.onChangeCallback = callback;
  }

  /**
   * Start the polling loop for session discovery
   */
  start(): void {
    if (this.pollTimer) return;
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
    this.paneCheckTimer = setInterval(() => this.checkPaneContent(), this.paneCheckIntervalMs);
  }

  /**
   * Stop the polling loop and clean up resources
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.paneCheckTimer) {
      clearInterval(this.paneCheckTimer);
      this.paneCheckTimer = null;
    }
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    for (const timer of this.summaryTimers.values()) {
      clearTimeout(timer);
    }
    this.summaryTimers.clear();
    for (const paneId of this.pipePanes.keys()) {
      this.teardownPipePane(paneId);
    }
  }

  /**
   * Get all sessions, optionally filtered by status
   */
  getSessions(filter?: string): SessionResponse[] {
    const sessions = Array.from(this.sessions.values());

    const filtered = sessions.filter((s) => {
      if (!filter || filter === "all") return true;
      return s.status === filter;
    });

    filtered.sort((a, b) => b.last_activity.localeCompare(a.last_activity));

    return filtered.map((s) => ({
      pane_id: s.pane_id,
      project_name: s.project_name,
      git_branch: s.git_branch,
      status: s.status,
      summary: s.status === "busy" ? null : s.summary,
      tmux_target: s.tmux_target,
      last_activity: s.last_activity,
    }));
  }

  /**
   * Get a single session by pane ID
   */
  getSession(paneId: string): SessionResponse | null {
    const state = this.sessions.get(paneId);
    if (!state) return null;

    return {
      pane_id: state.pane_id,
      project_name: state.project_name,
      git_branch: state.git_branch,
      status: state.status,
      summary: state.status === "busy" ? null : state.summary,
      tmux_target: state.tmux_target,
      last_activity: state.last_activity,
    };
  }

  /**
   * Main polling loop - discover/remove sessions only.
   * Status detection is handled by pipe-pane (or capture-pane fallback).
   */
  private poll(): void {
    if (!this.deps.isTmuxAvailable()) {
      if (this.sessions.size > 0) {
        this.cleanupAllSessions();
        this.notifyChange();
      }
      return;
    }

    const panes = this.deps.getAllTmuxPanes();
    const processTable = this.deps.getProcessTable();
    const processes = this.deps.getClaudeProcesses(processTable);
    const matches = this.deps.matchProcessesToPanes(processes, panes, processTable);

    const foundPanes = new Set<string>();
    let changed = false;

    for (const [paneId, { process, pane }] of matches) {
      foundPanes.add(paneId);
      const existing = this.sessions.get(paneId);
      if (!existing) {
        const didCreate = this.createSession(paneId, process.pid, pane);
        if (didCreate) changed = true;
      } else if (existing.process_pid !== process.pid) {
        // Claude process changed in this pane — recreate session with fresh metadata
        this.removeSession(paneId);
        const didCreate = this.createSession(paneId, process.pid, pane);
        if (didCreate) changed = true;
      } else if (!existing.jsonl_path) {
        // Retry finding JSONL path — file may not have existed at session creation
        const jsonlPath = this.deps.findSessionJsonlPath(existing.cwd);
        if (jsonlPath) {
          existing.jsonl_path = jsonlPath;
        }
      }
    }

    // Remove sessions whose panes no longer exist
    for (const paneId of this.sessions.keys()) {
      if (!foundPanes.has(paneId)) {
        this.removeSession(paneId);
        changed = true;
      }
    }

    if (changed) {
      this.notifyChange();
    }
  }

  /**
   * Create a new session and set up pipe-pane activity detection
   */
  private createSession(paneId: string, processPid: number, pane: TmuxPane): boolean {
    const cwd = this.deps.getProcessCwd(processPid);
    if (!cwd) return false;

    const jsonlPath = this.deps.findSessionJsonlPath(cwd);

    this.sessions.set(paneId, {
      pane_id: paneId,
      process_pid: processPid,
      cwd,
      project_name: this.deps.getProjectName(cwd),
      git_branch: this.deps.getGitBranch(cwd),
      status: "busy",
      summary: null,
      tmux_target: this.deps.buildTmuxTarget(pane),
      jsonl_path: jsonlPath,
      last_activity: new Date().toISOString(),
      previousPaneContent: null,
      summary_pending: false,
      pipePaneActive: false,
      summaryJsonlMtime: null,
    });

    // Set up pipe-pane for real-time activity detection
    this.setupPipePane(paneId);

    // Start idle timer
    this.resetIdleTimer(paneId);

    return true;
  }

  /**
   * Remove a session and clean up its resources
   */
  private removeSession(paneId: string): void {
    this.sessions.delete(paneId);
    this.teardownPipePane(paneId);
    const idleTimer = this.idleTimers.get(paneId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(paneId);
    }
    this.cancelSummaryTimer(paneId);
  }

  /**
   * Clean up all sessions
   */
  private cleanupAllSessions(): void {
    for (const paneId of this.sessions.keys()) {
      this.teardownPipePane(paneId);
      const idleTimer = this.idleTimers.get(paneId);
      if (idleTimer) clearTimeout(idleTimer);
    }
    this.sessions.clear();
    this.idleTimers.clear();
    for (const timer of this.summaryTimers.values()) {
      clearTimeout(timer);
    }
    this.summaryTimers.clear();
  }

  /**
   * Reset the idle timer for a session
   */
  private resetIdleTimer(paneId: string): void {
    const existing = this.idleTimers.get(paneId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.onIdleTimeout(paneId);
    }, this.idleThresholdMs);

    this.idleTimers.set(paneId, timer);
  }

  /**
   * Called when idle timer expires — transition to WAITING
   */
  private onIdleTimeout(paneId: string): void {
    const session = this.sessions.get(paneId);
    if (!session || session.status !== "busy") return;

    session.status = "waiting";
    session.last_activity = new Date().toISOString();
    this.notifyChange();

    // Schedule summary generation after sustained WAITING period.
    // If the session goes BUSY before the timer fires, it gets cancelled.
    this.scheduleSummaryTimer(paneId);
  }

  /**
   * Schedule a summary generation after a delay.
   * Only fires if the session is still WAITING when the timer expires.
   */
  private scheduleSummaryTimer(paneId: string): void {
    this.cancelSummaryTimer(paneId);

    const timer = setTimeout(() => {
      this.summaryTimers.delete(paneId);
      const session = this.sessions.get(paneId);
      if (session?.status === "waiting" && !session.summary_pending) {
        session.summary_pending = true;
        this.generateSummaryAsync(paneId);
      }
    }, this.summaryDelayMs);

    this.summaryTimers.set(paneId, timer);
  }

  /**
   * Cancel a pending summary timer
   */
  private cancelSummaryTimer(paneId: string): void {
    const timer = this.summaryTimers.get(paneId);
    if (timer) {
      clearTimeout(timer);
      this.summaryTimers.delete(paneId);
    }
  }

  /**
   * Generate AI summary in background for a waiting session
   */
  private async generateSummaryAsync(paneId: string): Promise<void> {
    const session = this.sessions.get(paneId);
    if (!session?.jsonl_path) {
      if (session) session.summary_pending = false;
      return;
    }

    // JSONL mtime guard: skip Gemini call if content hasn't changed since last summary
    const currentMtime = this.deps.getJsonlMtime(session.jsonl_path);
    if (
      currentMtime !== null &&
      session.summaryJsonlMtime !== null &&
      currentMtime === session.summaryJsonlMtime &&
      session.summary !== null
    ) {
      // JSONL unchanged — reuse cached summary, mark as pending to prevent re-triggering
      session.summary_pending = true;
      this.notifyChange();
      return;
    }

    try {
      const conversation = this.deps.extractJsonlConversation(session.jsonl_path);
      if (!conversation) {
        session.summary_pending = false;
        return;
      }

      const summary = await this.deps.generateSummary(conversation);
      // Re-check session still exists and is still waiting
      const current = this.sessions.get(paneId);
      if (current && current.status === "waiting") {
        current.summary = summary;
        current.summaryJsonlMtime = currentMtime;
        // Keep summary_pending = true to prevent re-triggering in the same
        // WAITING period. It resets to false when the session goes BUSY.
        this.notifyChange();
      }
    } catch {
      const current = this.sessions.get(paneId);
      if (current) {
        current.summary_pending = false;
      }
    }
  }

  /**
   * Set up FIFO-based pipe-pane for real-time activity detection.
   * Creates a named pipe, starts a reader process, then starts tmux pipe-pane.
   */
  private setupPipePane(paneId: string): void {
    // Clean up any existing pipe for this pane
    this.teardownPipePane(paneId);

    const id = paneId.replace("%", "");
    const fifoPath = join(tmpdir(), `crux-pipe-${id}-${Date.now()}.fifo`);

    // Create FIFO
    if (!this.deps.createFifo(fifoPath)) {
      return; // FIFO creation failed — fall back to polling
    }

    // Open reader FIRST to prevent writer blocking
    const readerProcess = this.deps.spawnFifoReader(fifoPath);

    readerProcess.stdout?.on("data", () => {
      this.onPipePaneActivity(paneId);
    });

    readerProcess.on("error", () => {
      // Reader failed — clean up and fall back to polling
      this.teardownPipePane(paneId);
    });

    this.pipePanes.set(paneId, { fifoPath, readerProcess });

    // Start pipe-pane → FIFO
    const started = this.deps.startPipePane(paneId, fifoPath);
    if (started) {
      const session = this.sessions.get(paneId);
      if (session) session.pipePaneActive = true;
    } else {
      // pipe-pane failed — clean up
      this.teardownPipePane(paneId);
    }
  }

  /**
   * Tear down pipe-pane and clean up FIFO for a session.
   */
  private teardownPipePane(paneId: string): void {
    const state = this.pipePanes.get(paneId);
    if (!state) return;

    // Cancel tmux pipe-pane
    this.deps.stopPipePane(paneId);

    // Kill reader process
    state.readerProcess.kill("SIGTERM");

    // Remove FIFO
    try {
      if (existsSync(state.fifoPath)) {
        unlinkSync(state.fifoPath);
      }
    } catch {
      // Best effort cleanup
    }

    this.pipePanes.delete(paneId);

    const session = this.sessions.get(paneId);
    if (session) session.pipePaneActive = false;
  }

  /**
   * Called when pipe-pane receives any output — session is active.
   * Resets idle timer on every data event (both BUSY and WAITING).
   * Summary is preserved internally for cache restoration; API methods filter it.
   */
  private onPipePaneActivity(paneId: string): void {
    const session = this.sessions.get(paneId);
    if (!session) return;

    if (session.status === "waiting") {
      session.status = "busy";
      session.summary_pending = false;
      this.cancelSummaryTimer(paneId);
      this.notifyChange();
    }
    // Always reset idle timer — pipe data resets idle timer even during BUSY
    this.resetIdleTimer(paneId);
    session.last_activity = new Date().toISOString();
  }

  /**
   * Check pane content for all sessions.
   * When pipe-pane is active: only checks for static screen to trigger summary.
   * When pipe-pane is unavailable: also detects content changes for WAITING → BUSY fallback.
   */
  private checkPaneContent(): void {
    for (const [paneId, session] of this.sessions) {
      const content = this.deps.capturePaneContent(session.pane_id);
      if (content === null) continue;

      const isStatic =
        session.previousPaneContent !== null && content === session.previousPaneContent;
      const isContentChanged =
        session.previousPaneContent !== null && content !== session.previousPaneContent;
      session.previousPaneContent = content;

      // Fallback: capture-pane activity detection when pipe-pane unavailable
      if (!session.pipePaneActive && isContentChanged) {
        if (session.status === "waiting") {
          session.status = "busy";
          session.last_activity = new Date().toISOString();
          session.summary_pending = false;
          this.cancelSummaryTimer(paneId);
          this.notifyChange();
        }
        this.resetIdleTimer(paneId);
        continue;
      }

      // Dual-condition: pane static AND WAITING → trigger summary immediately
      if (isStatic && session.status === "waiting" && !session.summary_pending) {
        session.summary_pending = true;
        this.cancelSummaryTimer(paneId);
        this.generateSummaryAsync(paneId);
      }
    }
  }

  private notifyChange(): void {
    this.onChangeCallback?.();
  }
}

function defaultCreateFifo(path: string): boolean {
  try {
    execSync(`mkfifo '${path}'`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function defaultSpawnFifoReader(path: string): ChildProcess {
  return spawn("cat", [path], {
    stdio: ["ignore", "pipe", "ignore"],
  });
}
