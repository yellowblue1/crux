import { type FSWatcher, watch } from "node:fs";
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
  watchFile: (path: string, callback: () => void) => FSWatcher;
  capturePaneContent: (paneId: string) => string | null;
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

/**
 * Manages Claude Code session state via tmux polling + JSONL file watching.
 *
 * Session discovery: polls ps + tmux list-panes periodically.
 * Idle detection: watches JSONL files with fs.watch — file changes mean BUSY,
 * no changes for idleThresholdMs means WAITING.
 * Summary generation: dual-condition — when WAITING AND tmux pane content is
 * static (unchanged between consecutive captures), triggers Gemini immediately.
 * Falls back to summaryDelayMs timeout if capture-pane is unavailable.
 */
export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private watchers = new Map<string, FSWatcher>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private summaryTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
      watchFile: deps?.watchFile ?? defaultWatchFile,
      capturePaneContent: deps?.capturePaneContent ?? tmux.capturePaneContent,
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
   * Stop the polling loop and clean up watchers
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
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    for (const timer of this.summaryTimers.values()) {
      clearTimeout(timer);
    }
    this.summaryTimers.clear();
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
      summary: s.summary,
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
      summary: state.summary,
      tmux_target: state.tmux_target,
      last_activity: state.last_activity,
    };
  }

  /**
   * Main polling loop - discover/remove sessions only.
   * Idle detection is handled by fs.watch on JSONL files.
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
   * Create a new session and start watching its JSONL file
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
      last_changed: Date.now(),
      last_activity: new Date().toISOString(),
      previousPaneContent: null,
      summary_pending: false,
    });

    // Start watching the JSONL file for idle detection
    if (jsonlPath) {
      this.startWatching(paneId, jsonlPath);
    }

    // Start idle timer (in case JSONL is never updated)
    this.resetIdleTimer(paneId);

    return true;
  }

  /**
   * Remove a session and clean up its watcher/timer
   */
  private removeSession(paneId: string): void {
    this.sessions.delete(paneId);
    this.stopWatching(paneId);
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
      this.stopWatching(paneId);
      const idleTimer = this.idleTimers.get(paneId);
      if (idleTimer) clearTimeout(idleTimer);
    }
    this.sessions.clear();
    this.watchers.clear();
    this.idleTimers.clear();
    for (const timer of this.summaryTimers.values()) {
      clearTimeout(timer);
    }
    this.summaryTimers.clear();
  }

  /**
   * Start watching a JSONL file for changes
   */
  private startWatching(paneId: string, jsonlPath: string): void {
    this.stopWatching(paneId);

    try {
      const watcher = this.deps.watchFile(jsonlPath, () => {
        this.onJsonlChange(paneId);
      });
      this.watchers.set(paneId, watcher);
    } catch {
      // File may not exist yet or be inaccessible
    }
  }

  /**
   * Stop watching a JSONL file
   */
  private stopWatching(paneId: string): void {
    const watcher = this.watchers.get(paneId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(paneId);
    }
  }

  /**
   * Called when the JSONL file changes — session is active
   */
  private onJsonlChange(paneId: string): void {
    const session = this.sessions.get(paneId);
    if (!session) return;

    session.last_changed = Date.now();
    session.last_activity = new Date().toISOString();

    if (session.status === "waiting") {
      session.status = "busy";
      session.summary_pending = false;
      session.summary = null;
      // Cancel pending summary timer — session is active again
      this.cancelSummaryTimer(paneId);
      this.notifyChange();
    }

    // Reset the idle timer
    this.resetIdleTimer(paneId);
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
   * Check pane content for all sessions — dual-condition idle detection.
   * If a WAITING session's pane content hasn't changed since the last check,
   * the session is confirmed idle and summary generation is triggered immediately.
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

      // Pane content changed while WAITING → Claude is active (e.g., thinking/streaming)
      if (isContentChanged && session.status === "waiting") {
        session.status = "busy";
        session.last_activity = new Date().toISOString();
        session.summary_pending = false;
        session.summary = null;
        this.cancelSummaryTimer(paneId);
        this.resetIdleTimer(paneId);
        this.notifyChange();
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

function defaultWatchFile(path: string, callback: () => void): FSWatcher {
  return watch(path, () => callback());
}
