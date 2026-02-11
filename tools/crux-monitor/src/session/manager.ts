import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
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
  getProcessStartTime: (pid: number) => string | null;
  hasActiveNetworkConnections: (pid: number) => boolean;
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
  capturePaneContentForSummary: (paneId: string) => string | null;
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
  maxNetworkIdleResets?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_IDLE_THRESHOLD_MS = 1000;
const DEFAULT_SUMMARY_DELAY_MS = 10_000; // 10 seconds of sustained WAITING (fallback)
const DEFAULT_PANE_CHECK_INTERVAL_MS = 1000; // 1 second pane diff polling
const DEFAULT_MAX_NETWORK_IDLE_RESETS = 1; // max times network activity can postpone WAITING

/** State for a single FIFO-based pipe-pane monitor */
interface PipePaneState {
  fifoPath: string;
  readerProcess: ChildProcess;
}

/**
 * Manages Claude Code session state via tmux polling + pipe-pane activity detection.
 *
 * Session discovery: polls ps + tmux list-panes periodically.
 * Status detection: pipe-pane (FIFO) is the primary signal for both directions:
 *   - WAITING → BUSY: any data on the pipe
 *   - BUSY → WAITING: no pipe data for idleThresholdMs
 * Capture-pane polling runs as a redundant signal alongside pipe-pane, providing
 * self-healing when pipe-pane dies silently (e.g. tmux disconnects the writer).
 * Summary generation: dual-condition — when WAITING AND tmux pane content is
 * static (unchanged between consecutive captures), triggers Gemini immediately.
 * Falls back to summaryDelayMs timeout if capture-pane is unavailable.
 * Uses pane content as primary source for summaries, with JSONL as fallback.
 * Content hash guard prevents redundant Gemini calls when content hasn't changed.
 */
export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private summaryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pipePanes = new Map<string, PipePaneState>();
  private networkIdleResets = new Map<string, number>();
  private deps: SessionManagerDeps;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private paneCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pollIntervalMs: number;
  private readonly idleThresholdMs: number;
  private readonly summaryDelayMs: number;
  private readonly paneCheckIntervalMs: number;
  private readonly maxNetworkIdleResets: number;
  private onChangeCallback: (() => void) | null = null;
  private paneActivityCallback: ((paneId: string) => void) | null = null;

  constructor(deps?: Partial<SessionManagerDeps>, options?: SessionManagerOptions) {
    this.deps = {
      isTmuxAvailable: deps?.isTmuxAvailable ?? tmux.isTmuxAvailable,
      getAllTmuxPanes: deps?.getAllTmuxPanes ?? tmux.getAllTmuxPanes,
      getProcessTable: deps?.getProcessTable ?? tmux.getProcessTable,
      getClaudeProcesses: deps?.getClaudeProcesses ?? tmux.getClaudeProcesses,
      getProcessCwd: deps?.getProcessCwd ?? tmux.getProcessCwd,
      getProcessStartTime: deps?.getProcessStartTime ?? tmux.getProcessStartTime,
      hasActiveNetworkConnections:
        deps?.hasActiveNetworkConnections ?? tmux.hasActiveNetworkConnections,
      getProjectName: deps?.getProjectName ?? tmux.getProjectName,
      getGitBranch: deps?.getGitBranch ?? tmux.getGitBranch,
      buildTmuxTarget: deps?.buildTmuxTarget ?? tmux.buildTmuxTarget,
      matchProcessesToPanes: deps?.matchProcessesToPanes ?? tmux.matchProcessesToPanes,
      findSessionJsonlPath: deps?.findSessionJsonlPath ?? tmux.findSessionJsonlPath,
      extractJsonlConversation: deps?.extractJsonlConversation ?? tmux.extractJsonlConversation,
      generateSummary: deps?.generateSummary ?? (async () => null),
      getJsonlMtime: deps?.getJsonlMtime ?? tmux.getJsonlMtime,
      capturePaneContent: deps?.capturePaneContent ?? tmux.capturePaneContent,
      capturePaneContentForSummary:
        deps?.capturePaneContentForSummary ?? tmux.capturePaneContentSanitized,
      startPipePane: deps?.startPipePane ?? tmux.startPipePane,
      stopPipePane: deps?.stopPipePane ?? tmux.stopPipePane,
      createFifo: deps?.createFifo ?? defaultCreateFifo,
      spawnFifoReader: deps?.spawnFifoReader ?? defaultSpawnFifoReader,
    };
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.idleThresholdMs = options?.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
    this.summaryDelayMs = options?.summaryDelayMs ?? DEFAULT_SUMMARY_DELAY_MS;
    this.paneCheckIntervalMs = options?.paneCheckIntervalMs ?? DEFAULT_PANE_CHECK_INTERVAL_MS;
    this.maxNetworkIdleResets = options?.maxNetworkIdleResets ?? DEFAULT_MAX_NETWORK_IDLE_RESETS;
  }

  /**
   * Register a callback to be notified when session state changes
   */
  onChange(callback: () => void): void {
    this.onChangeCallback = callback;
  }

  /**
   * Register a callback to be notified when a pane has output activity.
   * Fires on every pipe-pane data event (callers should debounce as needed).
   */
  onPaneActivity(callback: (paneId: string) => void): void {
    this.paneActivityCallback = callback;
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
      try {
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
      } catch {
        // Continue processing other panes — one pane's error should not
        // prevent cleanup of stale sessions in the loop below
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
      last_activity: this.deps.getProcessStartTime(processPid) ?? new Date().toISOString(),
      previousPaneContent: null,
      summary_pending: false,
      pipePaneActive: false,
      summaryJsonlMtime: null,
      summaryContentHash: null,
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
    this.networkIdleResets.delete(paneId);
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
    this.networkIdleResets.clear();
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

    // If the process has active network connections (e.g. API calls),
    // stay BUSY and re-check after another idle interval — up to a maximum
    // number of resets to handle persistent keep-alive connections.
    const resets = this.networkIdleResets.get(paneId) ?? 0;
    if (
      resets < this.maxNetworkIdleResets &&
      this.deps.hasActiveNetworkConnections(session.process_pid)
    ) {
      this.networkIdleResets.set(paneId, resets + 1);
      this.resetIdleTimer(paneId);
      return;
    }
    this.networkIdleResets.delete(paneId);

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
      if (session?.status === "waiting") {
        // Reset summary_pending so generateSummaryAsync can proceed.
        // This is needed for retry-after-failure: the previous attempt
        // may have left summary_pending = true to block checkPaneContent.
        session.summary_pending = false;
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
   * Generate AI summary in background for a waiting session.
   * Uses pane content as primary source, falls back to JSONL conversation.
   * Guards against duplicate invocations via summary_pending flag.
   */
  private async generateSummaryAsync(paneId: string): Promise<void> {
    const session = this.sessions.get(paneId);
    if (!session) return;

    // Atomic guard: if already pending, skip. Otherwise claim the slot.
    // This prevents duplicate Gemini calls when both the summary delay timer
    // and checkPaneContent trigger generateSummaryAsync near-simultaneously.
    if (session.summary_pending) return;
    session.summary_pending = true;

    // Try sanitized pane content first (strips autocomplete ghost text), fall back to JSONL
    let content = this.deps.capturePaneContentForSummary(session.pane_id);
    let contentSource: "pane" | "jsonl" = "pane";

    if (!content && session.jsonl_path) {
      content = this.deps.extractJsonlConversation(session.jsonl_path);
      contentSource = "jsonl";
    }

    if (!content) {
      session.summary_pending = false;
      return;
    }

    // Content hash guard: skip Gemini call if content hasn't changed since last summary
    const currentHash = simpleHash(content);
    if (
      session.summaryContentHash !== null &&
      currentHash === session.summaryContentHash &&
      session.summary !== null
    ) {
      session.summary_pending = true;
      this.notifyChange();
      return;
    }

    try {
      const summary = await this.deps.generateSummary(content);
      const current = this.sessions.get(paneId);
      if (!current) {
        return;
      }

      if (summary !== null) {
        // Store summary regardless of current status. The API already filters
        // out summaries for BUSY sessions (returns null), so stale data is
        // never shown. This prevents summaries from getting stuck in active
        // conversations where the session transitions to BUSY during the call.
        current.summary = summary;
        current.summaryContentHash = currentHash;
        if (contentSource === "jsonl" && current.jsonl_path) {
          current.summaryJsonlMtime = this.deps.getJsonlMtime(current.jsonl_path);
        }
        // Keep summary_pending = true to prevent re-triggering in the same
        // WAITING period. It resets to false when the session goes BUSY.
        this.notifyChange();
      } else if (current.status === "waiting") {
        // Gemini returned null (error, auth failure, empty response, etc.).
        // Don't update summaryContentHash — don't cache failed results.
        // Schedule retry after summaryDelayMs. Keep summary_pending = true
        // to prevent checkPaneContent() from triggering immediately.
        this.scheduleSummaryTimer(paneId);
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

    // Detect unexpected reader exit (e.g. tmux pane destroyed → FIFO EOF)
    readerProcess.on("exit", () => {
      // Guard: teardownPipePane deletes from pipePanes synchronously
      // before killing the reader, so this won't fire for intentional teardowns
      if (this.pipePanes.has(paneId) && this.sessions.has(paneId)) {
        this.removeSession(paneId);
        this.notifyChange();
      }
    });

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

    // Remove from map FIRST to signal intentional teardown.
    // The exit handler checks pipePanes.has() to distinguish
    // intentional teardown from unexpected pane destruction.
    this.pipePanes.delete(paneId);

    // Cancel tmux pipe-pane
    this.deps.stopPipePane(paneId);

    // Kill reader process — SIGTERM first, escalate to SIGKILL if needed.
    // On macOS, cat blocked on a FIFO read may not respond to SIGTERM.
    state.readerProcess.kill("SIGTERM");
    setTimeout(() => {
      try {
        state.readerProcess.kill("SIGKILL");
      } catch {
        // Process already exited — ignore
      }
    }, 500);

    // Remove FIFO
    try {
      if (existsSync(state.fifoPath)) {
        unlinkSync(state.fifoPath);
      }
    } catch {
      // Best effort cleanup
    }

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
    this.networkIdleResets.delete(paneId);
    this.resetIdleTimer(paneId);
    session.last_activity = new Date().toISOString();
    this.paneActivityCallback?.(paneId);
  }

  /**
   * Check pane content for all sessions.
   * Always detects content changes for WAITING → BUSY transition (redundant with pipe-pane).
   * Also checks for static screen to trigger summary generation.
   */
  private checkPaneContent(): void {
    for (const [paneId, session] of this.sessions) {
      try {
        const content = this.deps.capturePaneContent(session.pane_id);
        if (content === null) continue;

        const isStatic =
          session.previousPaneContent !== null && content === session.previousPaneContent;
        const isContentChanged =
          session.previousPaneContent !== null && content !== session.previousPaneContent;
        session.previousPaneContent = content;

        // Content change detection: always active as redundant signal alongside pipe-pane.
        // When pipe-pane is working, both signals fire (pipe-pane first, capture-pane ~1s later).
        // When pipe-pane is broken (writer died silently), capture-pane catches it within 1s.
        if (isContentChanged) {
          if (session.status === "waiting") {
            session.status = "busy";
            session.last_activity = new Date().toISOString();
            session.summary_pending = false;
            this.cancelSummaryTimer(paneId);
            this.notifyChange();
          }
          this.networkIdleResets.delete(paneId);
          this.resetIdleTimer(paneId);
          this.paneActivityCallback?.(paneId);
          continue;
        }

        // Dual-condition: pane static AND WAITING → trigger summary immediately
        if (isStatic && session.status === "waiting" && !session.summary_pending) {
          this.cancelSummaryTimer(paneId);
          this.generateSummaryAsync(paneId);
        }
      } catch {
        // Best effort — skip this pane and continue with others
      }
    }
  }

  private notifyChange(): void {
    this.onChangeCallback?.();
  }
}

function defaultCreateFifo(path: string): boolean {
  try {
    const result = Bun.spawnSync(["mkfifo", path], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    return result.success;
  } catch {
    return false;
  }
}

function defaultSpawnFifoReader(path: string): ChildProcess {
  return spawn("cat", [path], {
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * Simple string hash for content deduplication (DJB2 algorithm).
 * Not cryptographic — only used to detect content changes.
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}
