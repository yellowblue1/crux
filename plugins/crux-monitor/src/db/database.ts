import { Database } from "bun:sqlite";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import type { Event, EventInput, EventResponse, FilterMode } from "../types";
import { DB_DIR, DB_FILE } from "./config";

export function getDbPath(): string {
  return DB_FILE;
}

export function dbExists(): boolean {
  return existsSync(DB_FILE);
}

export function ensureDbDir(): void {
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }
}

export function getDb(readonly = false): Database {
  ensureDbDir();
  if (readonly) {
    return new Database(DB_FILE, { readonly: true });
  }
  return new Database(DB_FILE);
}

function withReadOnlyDb<T>(fn: (db: Database) => T, defaultValue: T): T {
  if (!dbExists()) return defaultValue;
  const db = getDb(true);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function buildActiveEventsQuery(mode: FilterMode): string {
  const eventTypeFilter =
    mode === "waiting" ? "AND (event_type = 'Stop' OR event_type LIKE 'Notification%')" : "";

  // For "all" mode, don't exclude ended sessions
  const excludeEndedFilter =
    mode === "all"
      ? ""
      : `
      AND NOT EXISTS (
        SELECT 1 FROM events e3
        WHERE e3.session_id = e1.session_id
        AND e3.event_type = 'SessionEnd'
        AND e3.created_at > (
          SELECT COALESCE(MAX(created_at), '') FROM events e4
          WHERE e4.session_id = e1.session_id
          AND e4.event_type = 'SessionStart'
        )
      )
    `;

  return `
    SELECT
      id,
      event_id,
      session_id,
      event_type,
      created_at,
      summary,
      project_dir,
      project_name,
      tmux_window_id,
      git_branch
    FROM events e1
    WHERE e1.session_id != ''
    AND created_at = (
      SELECT MAX(created_at) FROM events e2
      WHERE e2.session_id = e1.session_id
    )
    ${eventTypeFilter}
    ${excludeEndedFilter}
    ORDER BY created_at DESC
  `;
}

function mapEventToResponse(row: Event): EventResponse {
  return {
    id: row.id,
    event_id: row.event_id,
    session_id: row.session_id,
    event_type: row.event_type,
    created_at: row.created_at,
    project_name: row.project_name || (row.project_dir ? basename(row.project_dir) : "unknown"),
    git_branch: row.git_branch || null,
    summary: row.summary || getDefaultSummary(row.event_type),
    tmux_command: getTmuxCommand(row),
    tmux_window_id: row.tmux_window_id || null,
  };
}

export function getActiveEvents(mode: FilterMode = "waiting"): EventResponse[] {
  return withReadOnlyDb((db) => {
    const query = buildActiveEventsQuery(mode);
    const rows = db.query(query).all() as Event[];
    return rows.map(mapEventToResponse);
  }, []);
}

function getTmuxCommand(row: Event): string | null {
  if (row.tmux_window_id) {
    return `tmux switch-client -t '${row.tmux_window_id}'`;
  }
  return null;
}

function getDefaultSummary(eventType: string): string {
  switch (eventType) {
    case "SessionStart":
      return "Session started";
    case "Stop":
      return "Task completed";
    case "Notification":
      return "Notification";
    case "SubagentStart":
      return "Subagent started";
    case "SubagentStop":
      return "Subagent stopped";
    case "PostToolUseFailure":
      return "Tool failed";
    default:
      return eventType;
  }
}

export function getDbLastModified(): number {
  if (!dbExists()) {
    return 0;
  }
  try {
    const stat = Bun.file(DB_FILE);
    return stat.lastModified;
  } catch {
    return 0;
  }
}

export function deleteSession(sessionId: string): boolean {
  if (!dbExists()) {
    return false;
  }

  const db = getDb();
  try {
    const result = db.prepare(`DELETE FROM events WHERE session_id = ?`).run(sessionId);

    return result.changes > 0;
  } catch (err) {
    console.error("Failed to delete session:", err);
    return false;
  } finally {
    db.close();
  }
}

export interface RecordEventOptions {
  eventType: string;
  summary: string;
  input: EventInput;
  tmuxWindowId?: string | null;
  gitBranch?: string | null;
  projectName?: string | null;
  processPid?: number | null;
}

export function recordEvent(options: RecordEventOptions): void {
  const { eventType, summary, input, tmuxWindowId, gitBranch, projectName, processPid } = options;

  ensureDbDir();
  const db = getDb();

  try {
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const datePart = now.split("T")[0];

    db.prepare(
      `INSERT INTO events (
        event_id, session_id, event_type, created_at,
        project_dir, summary, tmux_window_id, date_part, git_branch, project_name, process_pid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      eventId,
      input.session_id || "",
      eventType,
      now,
      input.cwd || "",
      summary,
      tmuxWindowId || null,
      datePart,
      gitBranch || "",
      projectName || null,
      processPid || null,
    );
  } finally {
    db.close();
  }
}

export function getTmuxWindowIdForSession(sessionId: string): string | null {
  if (!sessionId) return null;

  return withReadOnlyDb((db) => {
    const result = db
      .query(
        "SELECT tmux_window_id FROM events WHERE session_id = ? AND event_type = 'SessionStart' LIMIT 1",
      )
      .get(sessionId) as { tmux_window_id: string | null } | null;
    return result?.tmux_window_id || null;
  }, null);
}

function getProcessPidForSession(sessionId: string): number | null {
  if (!sessionId) return null;

  return withReadOnlyDb((db) => {
    const result = db
      .query(
        "SELECT process_pid FROM events WHERE session_id = ? AND event_type = 'SessionStart' LIMIT 1",
      )
      .get(sessionId) as { process_pid: number | null } | null;
    return result?.process_pid || null;
  }, null);
}

export function checkProcessExists(pid: number): boolean {
  // Validate pid is a positive integer to prevent command injection
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    execSync(`ps -p '${pid}'`, { stdio: "pipe", timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

export interface SessionStatus {
  exists: boolean;
  process_pid: number | null;
  process_running: boolean;
}

export function getSessionStatus(sessionId: string): SessionStatus {
  const pid = getProcessPidForSession(sessionId);
  return {
    exists: true,
    process_pid: pid,
    process_running: pid ? checkProcessExists(pid) : false,
  };
}

export interface PruneCandidate {
  session_id: string;
  project_name: string | null;
}

export function getPruneCandidates(): PruneCandidate[] {
  return withReadOnlyDb((db) => {
    // Get all distinct sessions with their project_name and process_pid from SessionStart
    const query = `
      SELECT DISTINCT
        e1.session_id,
        e1.project_name,
        e1.project_dir,
        (SELECT process_pid FROM events WHERE session_id = e1.session_id AND event_type = 'SessionStart' LIMIT 1) as process_pid
      FROM events e1
      WHERE e1.session_id != ''
      AND e1.created_at = (
        SELECT MAX(e2.created_at) FROM events e2
        WHERE e2.session_id = e1.session_id
      )
    `;

    const rows = db.query(query).all() as Array<{
      session_id: string;
      project_name: string | null;
      project_dir: string | null;
      process_pid: number | null;
    }>;

    // Filter by sessions where process is NOT running (check inline without N+1 queries)
    return rows
      .filter((row) => !row.process_pid || !checkProcessExists(row.process_pid))
      .map((row) => ({
        session_id: row.session_id,
        project_name: row.project_name || (row.project_dir ? basename(row.project_dir) : null),
      }));
  }, []);
}

export interface BulkPruneResult {
  deleted_count: number;
}

export function pruneDeadSessions(): BulkPruneResult {
  if (!dbExists()) {
    return { deleted_count: 0 };
  }

  const candidates = getPruneCandidates();
  if (candidates.length === 0) {
    return { deleted_count: 0 };
  }

  const db = getDb();
  try {
    const sessionIds = candidates.map((c) => c.session_id);
    const placeholders = sessionIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM events WHERE session_id IN (${placeholders})`).run(...sessionIds);

    return { deleted_count: candidates.length };
  } catch (err) {
    console.error("Failed to prune dead sessions:", err);
    return { deleted_count: 0 };
  } finally {
    db.close();
  }
}
