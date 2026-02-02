/**
 * Database test utilities for testing with in-memory SQLite
 */

import { Database } from "bun:sqlite";

/**
 * Create an in-memory SQLite database with the events schema
 */
export function createTestDatabase(): Database {
  const db = new Database(":memory:");

  // Create the events table with the same schema as production
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      project_dir TEXT,
      project_name TEXT,
      summary TEXT,
      tmux_window_id TEXT,
      date_part TEXT,
      git_branch TEXT,
      process_pid INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_date_part ON events(date_part);
  `);

  return db;
}

export interface SeedEventOptions {
  eventId?: string;
  sessionId?: string;
  eventType?: string;
  createdAt?: string;
  projectDir?: string;
  projectName?: string;
  summary?: string;
  tmuxWindowId?: string;
  gitBranch?: string;
  processPid?: number | null;
}

/**
 * Insert a test event into the database
 */
export function seedEvent(db: Database, options: SeedEventOptions = {}): number {
  const {
    eventId = crypto.randomUUID(),
    sessionId = `test-session-${Math.random().toString(36).slice(2, 8)}`,
    eventType = "Stop",
    createdAt = new Date().toISOString(),
    projectDir = "/test/project",
    projectName = "test-project",
    summary = "Test summary",
    tmuxWindowId = null,
    gitBranch = "main",
    processPid = null,
  } = options;

  const datePart = createdAt.split("T")[0];

  const result = db
    .prepare(
      `INSERT INTO events (
        event_id, session_id, event_type, created_at,
        project_dir, project_name, summary, tmux_window_id, date_part, git_branch, process_pid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      eventId,
      sessionId,
      eventType,
      createdAt,
      projectDir,
      projectName,
      summary,
      tmuxWindowId,
      datePart,
      gitBranch,
      processPid,
    );

  return Number(result.lastInsertRowid);
}

/**
 * Seed multiple events for a session lifecycle
 */
export function seedSessionEvents(
  db: Database,
  sessionId: string,
  events: Array<{ type: string; summary?: string; minutesAgo?: number }>,
): void {
  const baseTime = Date.now();

  for (const event of events) {
    const timestamp = new Date(baseTime - (event.minutesAgo || 0) * 60 * 1000);
    seedEvent(db, {
      sessionId,
      eventType: event.type,
      summary: event.summary,
      createdAt: timestamp.toISOString(),
    });
  }
}

/**
 * Get all events from the database
 */
export function getAllEvents(db: Database): unknown[] {
  return db.query("SELECT * FROM events ORDER BY created_at DESC").all();
}

/**
 * Clear all events from the database
 */
export function clearEvents(db: Database): void {
  db.exec("DELETE FROM events");
}
