/**
 * Unit tests for database.ts exported functions
 *
 * These tests mock the config module to use temp directories,
 * allowing us to test the actual exported functions.
 */

import { Database } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Generate unique temp paths for this test run
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_DB_DIR = join(tmpdir(), `crux-db-test-${testRunId}`);
const TEST_DB_FILE = join(TEST_DB_DIR, "events.db");

// Mock the config module BEFORE importing database.ts
mock.module("./config", () => ({
  DB_DIR: TEST_DB_DIR,
  DB_FILE: TEST_DB_FILE,
  RETENTION_DAYS: 30,
}));

// Now import the database module (uses mocked config)
import {
  checkProcessExists,
  dbExists,
  deleteSession,
  ensureDbDir,
  getActiveEvents,
  getDb,
  getDbLastModified,
  getDbPath,
  getPruneCandidates,
  getSessionStatus,
  getTmuxWindowIdForSession,
  pruneDeadSessions,
  recordEvent,
} from "./database";

// Helper to create the schema in a database
function initializeSchema(db: Database): void {
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
}

// Helper to setup a fresh database for each test
function setupTestDatabase(): void {
  // Clean up any existing test directory
  if (existsSync(TEST_DB_DIR)) {
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DB_DIR, { recursive: true });

  // Create a fresh database with schema
  const db = new Database(TEST_DB_FILE);
  initializeSchema(db);
  db.close();
}

// Helper to cleanup test directory
function cleanupTestDirectory(): void {
  if (existsSync(TEST_DB_DIR)) {
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
}

// Helper to insert test events directly
function insertTestEvent(
  db: Database,
  options: {
    sessionId: string;
    eventType: string;
    createdAt?: string;
    summary?: string;
    projectDir?: string;
    projectName?: string | null;
    tmuxWindowId?: string | null;
    gitBranch?: string;
    processPid?: number | null;
  },
): void {
  const eventId = crypto.randomUUID();
  const now = options.createdAt || new Date().toISOString();
  const datePart = now.split("T")[0];

  // Allow explicit null for projectName to test derivation from projectDir
  const projectName =
    options.projectName === null
      ? null
      : options.projectName !== undefined
        ? options.projectName
        : "test-project";

  db.prepare(
    `INSERT INTO events (
      event_id, session_id, event_type, created_at,
      project_dir, summary, tmux_window_id, date_part, git_branch, project_name, process_pid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    eventId,
    options.sessionId,
    options.eventType,
    now,
    options.projectDir || "/test/project",
    options.summary || "Test summary",
    options.tmuxWindowId || null,
    datePart,
    options.gitBranch || "main",
    projectName,
    options.processPid ?? null,
  );
}

describe("file system functions", () => {
  beforeEach(() => {
    cleanupTestDirectory();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  describe("getDbPath", () => {
    it("should return the configured database path", () => {
      const path = getDbPath();
      expect(path).toBe(TEST_DB_FILE);
    });
  });

  describe("dbExists", () => {
    it("should return false when database file does not exist", () => {
      expect(dbExists()).toBe(false);
    });

    it("should return true when database file exists", () => {
      mkdirSync(TEST_DB_DIR, { recursive: true });
      writeFileSync(TEST_DB_FILE, "");
      expect(dbExists()).toBe(true);
    });
  });

  describe("ensureDbDir", () => {
    it("should create the database directory if it does not exist", () => {
      expect(existsSync(TEST_DB_DIR)).toBe(false);
      ensureDbDir();
      expect(existsSync(TEST_DB_DIR)).toBe(true);
    });

    it("should not throw if directory already exists", () => {
      mkdirSync(TEST_DB_DIR, { recursive: true });
      expect(() => ensureDbDir()).not.toThrow();
    });
  });

  describe("getDbLastModified", () => {
    it("should return 0 when database does not exist", () => {
      expect(getDbLastModified()).toBe(0);
    });

    it("should return last modified time when database exists", () => {
      mkdirSync(TEST_DB_DIR, { recursive: true });
      writeFileSync(TEST_DB_FILE, "test content");

      const mtime = getDbLastModified();
      expect(mtime).toBeGreaterThan(0);
      // Should be recent (within last minute)
      expect(Date.now() - mtime).toBeLessThan(60000);
    });
  });
});

describe("getDb", () => {
  beforeEach(() => {
    cleanupTestDirectory();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should create database directory and return Database instance", () => {
    const db = getDb();

    expect(db).toBeInstanceOf(Database);
    expect(existsSync(TEST_DB_DIR)).toBe(true);

    db.close();
  });

  it("should create database in writable mode by default", () => {
    const db = getDb();

    // Should be able to write
    expect(() => {
      db.exec("CREATE TABLE IF NOT EXISTS test (id INTEGER)");
    }).not.toThrow();

    db.close();
  });

  it("should create database in readonly mode when specified", () => {
    // First create a database
    mkdirSync(TEST_DB_DIR, { recursive: true });
    const writeDb = new Database(TEST_DB_FILE);
    writeDb.exec("CREATE TABLE IF NOT EXISTS test (id INTEGER)");
    writeDb.close();

    // Open in readonly mode
    const db = getDb(true);

    // Should not be able to write
    expect(() => {
      db.exec("INSERT INTO test (id) VALUES (1)");
    }).toThrow();

    db.close();
  });
});

describe("recordEvent", () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should insert event with all required fields", () => {
    recordEvent({
      eventType: "Stop",
      summary: "Task completed",
      input: {
        session_id: "test-session-123",
        cwd: "/test/project",
      },
    });

    const db = getDb(true);
    const events = db.query("SELECT * FROM events").all() as Array<{
      session_id: string;
      event_type: string;
      summary: string;
      project_dir: string;
    }>;
    db.close();

    expect(events.length).toBe(1);
    expect(events[0].session_id).toBe("test-session-123");
    expect(events[0].event_type).toBe("Stop");
    expect(events[0].summary).toBe("Task completed");
    expect(events[0].project_dir).toBe("/test/project");
  });

  it("should insert event with optional fields", () => {
    recordEvent({
      eventType: "SessionStart",
      summary: "Session started",
      input: {
        session_id: "session-with-extras",
        cwd: "/projects/myapp",
      },
      tmuxWindowId: "@5",
      gitBranch: "feature/test",
      projectName: "myapp",
      processPid: 12345,
    });

    const db = getDb(true);
    const events = db.query("SELECT * FROM events").all() as Array<{
      session_id: string;
      event_type: string;
      tmux_window_id: string | null;
      git_branch: string;
      project_name: string | null;
      process_pid: number | null;
    }>;
    db.close();

    expect(events.length).toBe(1);
    expect(events[0].tmux_window_id).toBe("@5");
    expect(events[0].git_branch).toBe("feature/test");
    expect(events[0].project_name).toBe("myapp");
    expect(events[0].process_pid).toBe(12345);
  });

  it("should generate UUID and timestamp automatically", () => {
    const beforeTime = new Date().toISOString();

    recordEvent({
      eventType: "Notification",
      summary: "Test notification",
      input: { session_id: "auto-generated-test" },
    });

    const afterTime = new Date().toISOString();

    const db = getDb(true);
    const events = db.query("SELECT * FROM events").all() as Array<{
      event_id: string;
      created_at: string;
      date_part: string;
    }>;
    db.close();

    expect(events.length).toBe(1);
    // UUID format validation
    expect(events[0].event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Timestamp should be between before and after
    expect(events[0].created_at >= beforeTime).toBe(true);
    expect(events[0].created_at <= afterTime).toBe(true);
    // Date part should be extracted
    expect(events[0].date_part).toBe(events[0].created_at.split("T")[0]);
  });

  it("should handle missing optional input fields", () => {
    recordEvent({
      eventType: "Stop",
      summary: "Minimal event",
      input: {},
    });

    const db = getDb(true);
    const events = db.query("SELECT * FROM events").all() as Array<{
      session_id: string;
      project_dir: string;
    }>;
    db.close();

    expect(events.length).toBe(1);
    expect(events[0].session_id).toBe("");
    expect(events[0].project_dir).toBe("");
  });
});

describe("getActiveEvents", () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should return empty array when database is empty", () => {
    const events = getActiveEvents();
    expect(events).toEqual([]);
  });

  it("should return empty array when database does not exist", () => {
    cleanupTestDirectory();
    const events = getActiveEvents();
    expect(events).toEqual([]);
  });

  it('should return Stop and Notification events in "waiting" mode (default)', () => {
    const db = getDb();
    initializeSchema(db);

    // Insert events for two sessions
    insertTestEvent(db, {
      sessionId: "session-1",
      eventType: "SessionStart",
      createdAt: "2024-01-01T10:00:00.000Z",
    });
    insertTestEvent(db, {
      sessionId: "session-1",
      eventType: "Stop",
      createdAt: "2024-01-01T10:05:00.000Z",
      summary: "Completed task",
    });

    insertTestEvent(db, {
      sessionId: "session-2",
      eventType: "SessionStart",
      createdAt: "2024-01-01T10:02:00.000Z",
    });
    insertTestEvent(db, {
      sessionId: "session-2",
      eventType: "Notification",
      createdAt: "2024-01-01T10:07:00.000Z",
      summary: "Notification received",
    });

    db.close();

    const events = getActiveEvents("waiting");

    expect(events.length).toBe(2);
    // Should include both Stop and Notification
    expect(events.map((e) => e.event_type)).toContain("Stop");
    expect(events.map((e) => e.event_type)).toContain("Notification");
  });

  it('should return all non-ended sessions in "active" mode', () => {
    const db = getDb();
    initializeSchema(db);

    // Active session
    insertTestEvent(db, {
      sessionId: "active-session",
      eventType: "SessionStart",
      createdAt: "2024-01-01T10:00:00.000Z",
    });

    // Ended session
    insertTestEvent(db, {
      sessionId: "ended-session",
      eventType: "SessionStart",
      createdAt: "2024-01-01T10:01:00.000Z",
    });
    insertTestEvent(db, {
      sessionId: "ended-session",
      eventType: "SessionEnd",
      createdAt: "2024-01-01T10:05:00.000Z",
    });

    db.close();

    const events = getActiveEvents("active");

    expect(events.length).toBe(1);
    expect(events[0].session_id).toBe("active-session");
  });

  it('should include ended sessions in "all" mode', () => {
    const db = getDb();
    initializeSchema(db);

    // Active session
    insertTestEvent(db, {
      sessionId: "active-session",
      eventType: "SessionStart",
      createdAt: "2024-01-01T10:00:00.000Z",
    });

    // Ended session
    insertTestEvent(db, {
      sessionId: "ended-session",
      eventType: "SessionStart",
      createdAt: "2024-01-01T10:01:00.000Z",
    });
    insertTestEvent(db, {
      sessionId: "ended-session",
      eventType: "SessionEnd",
      createdAt: "2024-01-01T10:05:00.000Z",
    });

    db.close();

    const events = getActiveEvents("all");

    expect(events.length).toBe(2);
    const sessionIds = events.map((e) => e.session_id);
    expect(sessionIds).toContain("active-session");
    expect(sessionIds).toContain("ended-session");
  });

  it("should exclude events with empty session_id", () => {
    const db = getDb();
    initializeSchema(db);

    // Valid session
    insertTestEvent(db, {
      sessionId: "valid-session",
      eventType: "Stop",
      createdAt: "2024-01-01T10:00:00.000Z",
    });

    // Event with empty session_id
    insertTestEvent(db, {
      sessionId: "",
      eventType: "Stop",
      createdAt: "2024-01-01T10:01:00.000Z",
    });

    db.close();

    const events = getActiveEvents("waiting");

    expect(events.length).toBe(1);
    expect(events[0].session_id).toBe("valid-session");
  });

  it("should return only the latest event per session", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "session-1",
      eventType: "SessionStart",
      createdAt: "2024-01-01T10:00:00.000Z",
      summary: "Started",
    });
    insertTestEvent(db, {
      sessionId: "session-1",
      eventType: "Stop",
      createdAt: "2024-01-01T10:05:00.000Z",
      summary: "First stop",
    });
    insertTestEvent(db, {
      sessionId: "session-1",
      eventType: "Notification",
      createdAt: "2024-01-01T10:10:00.000Z",
      summary: "Latest notification",
    });

    db.close();

    const events = getActiveEvents("waiting");

    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe("Notification");
    expect(events[0].summary).toBe("Latest notification");
  });

  it("should include Notification:* event types in waiting mode", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "session-1",
      eventType: "Notification:idle_prompt",
      createdAt: "2024-01-01T10:00:00.000Z",
    });

    insertTestEvent(db, {
      sessionId: "session-2",
      eventType: "Notification:permission_prompt",
      createdAt: "2024-01-01T10:01:00.000Z",
    });

    db.close();

    const events = getActiveEvents("waiting");

    expect(events.length).toBe(2);
    expect(events.map((e) => e.event_type)).toContain("Notification:idle_prompt");
    expect(events.map((e) => e.event_type)).toContain("Notification:permission_prompt");
  });

  it("should map response fields correctly", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "response-test",
      eventType: "Stop",
      createdAt: "2024-01-01T10:00:00.000Z",
      summary: "Test summary",
      projectDir: "/test/project",
      projectName: "test-project",
      gitBranch: "feature/branch",
      tmuxWindowId: "@7",
    });

    db.close();

    const events = getActiveEvents("waiting");

    expect(events.length).toBe(1);
    const event = events[0];

    expect(event.session_id).toBe("response-test");
    expect(event.event_type).toBe("Stop");
    expect(event.summary).toBe("Test summary");
    expect(event.project_name).toBe("test-project");
    expect(event.git_branch).toBe("feature/branch");
    expect(event.tmux_window_id).toBe("@7");
    expect(event.tmux_command).toBe("tmux switch-client -t '@7'");
  });

  it("should derive project_name from project_dir basename if not set", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "basename-test",
      eventType: "Stop",
      createdAt: "2024-01-01T10:00:00.000Z",
      projectDir: "/users/dev/my-awesome-project",
      projectName: null,
    });

    db.close();

    const events = getActiveEvents("waiting");

    expect(events.length).toBe(1);
    expect(events[0].project_name).toBe("my-awesome-project");
  });

  it("should use default summary if not provided", () => {
    const db = getDb();
    initializeSchema(db);

    // Insert event with null summary
    const eventId = crypto.randomUUID();
    const now = "2024-01-01T10:00:00.000Z";
    db.prepare(
      `INSERT INTO events (
        event_id, session_id, event_type, created_at,
        project_dir, summary, tmux_window_id, date_part, git_branch, project_name, process_pid
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`,
    ).run(eventId, "summary-test", "Stop", now, "/test", now.split("T")[0], "main");

    db.close();

    const events = getActiveEvents("waiting");

    expect(events.length).toBe(1);
    expect(events[0].summary).toBe("Task completed"); // Default for Stop
  });
});

describe("getTmuxWindowIdForSession", () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should return null for empty sessionId", () => {
    const result = getTmuxWindowIdForSession("");
    expect(result).toBeNull();
  });

  it("should return null when database does not exist", () => {
    cleanupTestDirectory();
    const result = getTmuxWindowIdForSession("non-existent");
    expect(result).toBeNull();
  });

  it("should return tmux_window_id from SessionStart event", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "tmux-session",
      eventType: "SessionStart",
      tmuxWindowId: "@9",
    });

    db.close();

    const result = getTmuxWindowIdForSession("tmux-session");
    expect(result).toBe("@9");
  });

  it("should return null when session has no SessionStart event", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "no-start-session",
      eventType: "Stop",
    });

    db.close();

    const result = getTmuxWindowIdForSession("no-start-session");
    expect(result).toBeNull();
  });

  it("should return null when SessionStart has no tmux_window_id", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "no-tmux-session",
      eventType: "SessionStart",
      tmuxWindowId: null,
    });

    db.close();

    const result = getTmuxWindowIdForSession("no-tmux-session");
    expect(result).toBeNull();
  });
});

describe("deleteSession", () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should return false when database does not exist", () => {
    cleanupTestDirectory();
    const result = deleteSession("non-existent");
    expect(result).toBe(false);
  });

  it("should delete all events for a session and return true", () => {
    const db = getDb();
    initializeSchema(db);

    // Create session with multiple events
    insertTestEvent(db, { sessionId: "session-to-delete", eventType: "SessionStart" });
    insertTestEvent(db, { sessionId: "session-to-delete", eventType: "Stop" });
    insertTestEvent(db, { sessionId: "session-to-delete", eventType: "Notification" });

    // Create another session to verify it's not affected
    insertTestEvent(db, { sessionId: "session-to-keep", eventType: "SessionStart" });

    db.close();

    const result = deleteSession("session-to-delete");

    expect(result).toBe(true);

    // Verify session is deleted
    const db2 = getDb(true);
    const remaining = db2.query("SELECT session_id FROM events").all() as Array<{
      session_id: string;
    }>;
    db2.close();

    expect(remaining.length).toBe(1);
    expect(remaining[0].session_id).toBe("session-to-keep");
  });

  it("should return false for non-existent session", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, { sessionId: "existing-session", eventType: "Stop" });
    db.close();

    const result = deleteSession("non-existent-session");
    expect(result).toBe(false);
  });
});

describe("checkProcessExists", () => {
  it("should return true for current process PID", () => {
    const result = checkProcessExists(process.pid);
    expect(result).toBe(true);
  });

  it("should return false for non-existent PID", () => {
    // Use a very high PID that is unlikely to exist
    const result = checkProcessExists(999999999);
    expect(result).toBe(false);
  });

  it("should return false for invalid PID (0)", () => {
    const result = checkProcessExists(0);
    expect(result).toBe(false);
  });

  it("should return false for negative PID", () => {
    const result = checkProcessExists(-1);
    expect(result).toBe(false);
  });

  it("should return false for non-integer PID", () => {
    const result = checkProcessExists(1.5);
    expect(result).toBe(false);
  });
});

describe("getSessionStatus", () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should return exists: true with process running for valid PID", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "running-session",
      eventType: "SessionStart",
      processPid: process.pid,
    });

    db.close();

    const status = getSessionStatus("running-session");

    expect(status.exists).toBe(true);
    expect(status.process_pid).toBe(process.pid);
    expect(status.process_running).toBe(true);
  });

  it("should return process_running: false for dead process", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "dead-session",
      eventType: "SessionStart",
      processPid: 999999999, // Non-existent PID
    });

    db.close();

    const status = getSessionStatus("dead-session");

    expect(status.exists).toBe(true);
    expect(status.process_pid).toBe(999999999);
    expect(status.process_running).toBe(false);
  });

  it("should return process_running: false for session without PID", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "no-pid-session",
      eventType: "SessionStart",
      processPid: null,
    });

    db.close();

    const status = getSessionStatus("no-pid-session");

    expect(status.exists).toBe(true);
    expect(status.process_pid).toBeNull();
    expect(status.process_running).toBe(false);
  });
});

describe("getPruneCandidates", () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should return empty array when database is empty", () => {
    const candidates = getPruneCandidates();
    expect(candidates).toEqual([]);
  });

  it("should return empty array when database does not exist", () => {
    cleanupTestDirectory();
    const candidates = getPruneCandidates();
    expect(candidates).toEqual([]);
  });

  it("should return sessions with dead processes", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "dead-session",
      eventType: "SessionStart",
      processPid: 999999999, // Non-existent PID
      projectName: "dead-project",
    });

    db.close();

    const candidates = getPruneCandidates();

    expect(candidates.length).toBe(1);
    expect(candidates[0].session_id).toBe("dead-session");
    expect(candidates[0].project_name).toBe("dead-project");
  });

  it("should exclude sessions with running processes", () => {
    const db = getDb();
    initializeSchema(db);

    // Session with running process (current process)
    insertTestEvent(db, {
      sessionId: "running-session",
      eventType: "SessionStart",
      processPid: process.pid,
      projectName: "running-project",
    });

    // Session with dead process
    insertTestEvent(db, {
      sessionId: "dead-session",
      eventType: "SessionStart",
      processPid: 999999999,
      projectName: "dead-project",
    });

    db.close();

    const candidates = getPruneCandidates();

    expect(candidates.length).toBe(1);
    expect(candidates[0].session_id).toBe("dead-session");
  });

  it("should include sessions without PID as prune candidates", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "no-pid-session",
      eventType: "SessionStart",
      processPid: null,
      projectName: "no-pid-project",
    });

    db.close();

    const candidates = getPruneCandidates();

    expect(candidates.length).toBe(1);
    expect(candidates[0].session_id).toBe("no-pid-session");
  });

  it("should derive project_name from project_dir if not set", () => {
    const db = getDb();
    initializeSchema(db);

    insertTestEvent(db, {
      sessionId: "basename-session",
      eventType: "SessionStart",
      processPid: 999999999,
      projectDir: "/path/to/my-project",
      projectName: null,
    });

    db.close();

    const candidates = getPruneCandidates();

    expect(candidates.length).toBe(1);
    expect(candidates[0].project_name).toBe("my-project");
  });
});

describe("pruneDeadSessions", () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    cleanupTestDirectory();
  });

  it("should return deleted_count: 0 when database does not exist", () => {
    cleanupTestDirectory();
    const result = pruneDeadSessions();
    expect(result.deleted_count).toBe(0);
  });

  it("should return deleted_count: 0 when no candidates to prune", () => {
    const db = getDb();
    initializeSchema(db);

    // Session with running process
    insertTestEvent(db, {
      sessionId: "running-session",
      eventType: "SessionStart",
      processPid: process.pid,
    });

    db.close();

    const result = pruneDeadSessions();
    expect(result.deleted_count).toBe(0);
  });

  it("should delete dead sessions and return count", () => {
    const db = getDb();
    initializeSchema(db);

    // Create dead sessions
    insertTestEvent(db, {
      sessionId: "dead-1",
      eventType: "SessionStart",
      processPid: 999999998,
    });
    insertTestEvent(db, {
      sessionId: "dead-1",
      eventType: "Stop",
    });

    insertTestEvent(db, {
      sessionId: "dead-2",
      eventType: "SessionStart",
      processPid: 999999997,
    });

    // Keep session with running process
    insertTestEvent(db, {
      sessionId: "alive",
      eventType: "SessionStart",
      processPid: process.pid,
    });

    db.close();

    const result = pruneDeadSessions();

    expect(result.deleted_count).toBe(2); // Two dead sessions

    // Verify only alive session remains
    const db2 = getDb(true);
    const remaining = db2.query("SELECT DISTINCT session_id FROM events").all() as Array<{
      session_id: string;
    }>;
    db2.close();

    expect(remaining.length).toBe(1);
    expect(remaining[0].session_id).toBe("alive");
  });

  it("should delete all events for a dead session", () => {
    const db = getDb();
    initializeSchema(db);

    // Create dead session with multiple events
    insertTestEvent(db, {
      sessionId: "dead-multi",
      eventType: "SessionStart",
      processPid: 999999999,
    });
    insertTestEvent(db, {
      sessionId: "dead-multi",
      eventType: "Stop",
    });
    insertTestEvent(db, {
      sessionId: "dead-multi",
      eventType: "Notification",
    });

    db.close();

    const result = pruneDeadSessions();

    expect(result.deleted_count).toBe(1);

    // Verify all events are deleted
    const db2 = getDb(true);
    const count = db2.query("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
    db2.close();

    expect(count.cnt).toBe(0);
  });
});
