import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import {
  clearEvents,
  createTestDatabase,
  getAllEvents,
  seedEvent,
  seedSessionEvents,
} from "../__tests__";

describe("database test helpers", () => {
  let db: Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe("createTestDatabase", () => {
    it("should create an in-memory database with events table", () => {
      db = createTestDatabase();

      // Verify table exists
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
        .all();

      expect(tables.length).toBe(1);
    });

    it("should create all required columns", () => {
      db = createTestDatabase();

      const columns = db.query("PRAGMA table_info(events)").all() as Array<{ name: string }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("event_id");
      expect(columnNames).toContain("session_id");
      expect(columnNames).toContain("event_type");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("project_dir");
      expect(columnNames).toContain("project_name");
      expect(columnNames).toContain("summary");
      expect(columnNames).toContain("tmux_window_id");
      expect(columnNames).toContain("date_part");
      expect(columnNames).toContain("git_branch");
    });

    it("should create indexes", () => {
      db = createTestDatabase();

      const indexes = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'")
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain("idx_events_session_id");
      expect(indexNames).toContain("idx_events_created_at");
      expect(indexNames).toContain("idx_events_date_part");
    });
  });

  describe("seedEvent", () => {
    it("should insert an event with default values", () => {
      db = createTestDatabase();

      const id = seedEvent(db);

      expect(id).toBeGreaterThan(0);

      const events = getAllEvents(db);
      expect(events.length).toBe(1);
    });

    it("should insert an event with custom values", () => {
      db = createTestDatabase();

      const eventId = "custom-event-id";
      const sessionId = "custom-session-id";
      const eventType = "SessionStart";
      const summary = "Custom summary";
      const projectDir = "/custom/path";
      const projectName = "custom-project";
      const gitBranch = "feature/test";

      seedEvent(db, {
        eventId,
        sessionId,
        eventType,
        summary,
        projectDir,
        projectName,
        gitBranch,
      });

      const events = getAllEvents(db) as Array<{
        event_id: string;
        session_id: string;
        event_type: string;
        summary: string;
        project_dir: string;
        project_name: string;
        git_branch: string;
      }>;

      expect(events.length).toBe(1);
      expect(events[0].event_id).toBe(eventId);
      expect(events[0].session_id).toBe(sessionId);
      expect(events[0].event_type).toBe(eventType);
      expect(events[0].summary).toBe(summary);
      expect(events[0].project_dir).toBe(projectDir);
      expect(events[0].project_name).toBe(projectName);
      expect(events[0].git_branch).toBe(gitBranch);
    });

    it("should set date_part from created_at", () => {
      db = createTestDatabase();

      const createdAt = "2024-01-15T10:30:00.000Z";

      seedEvent(db, { createdAt });

      const events = getAllEvents(db) as Array<{ date_part: string }>;
      expect(events[0].date_part).toBe("2024-01-15");
    });

    it("should allow tmux_window_id to be set", () => {
      db = createTestDatabase();

      seedEvent(db, { tmuxWindowId: "@5" });

      const events = getAllEvents(db) as Array<{ tmux_window_id: string | null }>;
      expect(events[0].tmux_window_id).toBe("@5");
    });
  });

  describe("seedSessionEvents", () => {
    it("should seed multiple events for a session", () => {
      db = createTestDatabase();

      seedSessionEvents(db, "test-session", [
        { type: "SessionStart", summary: "Started" },
        { type: "Stop", summary: "Completed task" },
      ]);

      const events = getAllEvents(db);
      expect(events.length).toBe(2);
    });

    it("should respect minutesAgo for event ordering", () => {
      db = createTestDatabase();

      seedSessionEvents(db, "test-session", [
        { type: "SessionStart", minutesAgo: 10 },
        { type: "Stop", minutesAgo: 5 },
        { type: "Notification", minutesAgo: 0 },
      ]);

      const events = getAllEvents(db) as Array<{ event_type: string }>;

      // getAllEvents returns DESC order, so most recent first
      expect(events[0].event_type).toBe("Notification");
      expect(events[1].event_type).toBe("Stop");
      expect(events[2].event_type).toBe("SessionStart");
    });

    it("should use same session ID for all events", () => {
      db = createTestDatabase();

      seedSessionEvents(db, "shared-session", [
        { type: "SessionStart" },
        { type: "Stop" },
        { type: "SessionEnd" },
      ]);

      const events = getAllEvents(db) as Array<{ session_id: string }>;
      for (const event of events) {
        expect(event.session_id).toBe("shared-session");
      }
    });
  });

  describe("clearEvents", () => {
    it("should remove all events from database", () => {
      db = createTestDatabase();

      seedEvent(db);
      seedEvent(db);
      seedEvent(db);

      expect(getAllEvents(db).length).toBe(3);

      clearEvents(db);

      expect(getAllEvents(db).length).toBe(0);
    });
  });

  describe("getAllEvents", () => {
    it("should return empty array for empty database", () => {
      db = createTestDatabase();

      const events = getAllEvents(db);

      expect(events).toEqual([]);
    });

    it("should return events in descending order by created_at", () => {
      db = createTestDatabase();

      seedEvent(db, { createdAt: "2024-01-01T10:00:00.000Z", summary: "First" });
      seedEvent(db, { createdAt: "2024-01-01T12:00:00.000Z", summary: "Third" });
      seedEvent(db, { createdAt: "2024-01-01T11:00:00.000Z", summary: "Second" });

      const events = getAllEvents(db) as Array<{ summary: string }>;

      expect(events[0].summary).toBe("Third");
      expect(events[1].summary).toBe("Second");
      expect(events[2].summary).toBe("First");
    });
  });
});

describe("process tracking", () => {
  describe("checkProcessExists", () => {
    // Import the actual function for testing
    const { checkProcessExists } = require("./database");

    it("should return true for current process PID", () => {
      const result = checkProcessExists(process.pid);
      expect(result).toBe(true);
    });

    it("should return false for non-existent PID", () => {
      // Use a very high PID that is unlikely to exist
      const result = checkProcessExists(999999999);
      expect(result).toBe(false);
    });

    it("should return false for PID 0", () => {
      // PID 0 is typically the kernel scheduler, but ps -p 0 usually fails
      const result = checkProcessExists(0);
      expect(result).toBe(false);
    });
  });
});

describe("deleteSession simulation", () => {
  let db: Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it("should delete all events for a session", () => {
    db = createTestDatabase();

    // Create two sessions
    seedSessionEvents(db, "session-to-delete", [
      { type: "SessionStart", minutesAgo: 10 },
      { type: "Stop", minutesAgo: 5 },
      { type: "Notification", minutesAgo: 2 },
    ]);

    seedSessionEvents(db, "session-to-keep", [
      { type: "SessionStart", minutesAgo: 8 },
      { type: "Stop", minutesAgo: 3 },
    ]);

    // Verify both sessions exist
    const allEventsBefore = getAllEvents(db);
    expect(allEventsBefore.length).toBe(5);

    // Delete one session
    const result = db.prepare("DELETE FROM events WHERE session_id = ?").run("session-to-delete");

    expect(result.changes).toBe(3);

    // Verify only session-to-keep remains
    const allEventsAfter = getAllEvents(db) as Array<{ session_id: string }>;
    expect(allEventsAfter.length).toBe(2);
    for (const event of allEventsAfter) {
      expect(event.session_id).toBe("session-to-keep");
    }
  });

  it("should return 0 changes for non-existent session", () => {
    db = createTestDatabase();

    seedSessionEvents(db, "existing-session", [
      { type: "SessionStart", minutesAgo: 10 },
      { type: "Stop", minutesAgo: 5 },
    ]);

    const result = db
      .prepare("DELETE FROM events WHERE session_id = ?")
      .run("non-existent-session");

    expect(result.changes).toBe(0);

    // Verify existing session is unchanged
    const allEvents = getAllEvents(db);
    expect(allEvents.length).toBe(2);
  });

  it("should not affect other sessions when deleting", () => {
    db = createTestDatabase();

    // Create three sessions
    seedSessionEvents(db, "session-1", [
      { type: "SessionStart", minutesAgo: 15 },
      { type: "Stop", minutesAgo: 12 },
    ]);

    seedSessionEvents(db, "session-2", [
      { type: "SessionStart", minutesAgo: 10 },
      { type: "Stop", minutesAgo: 7 },
    ]);

    seedSessionEvents(db, "session-3", [
      { type: "SessionStart", minutesAgo: 5 },
      { type: "Stop", minutesAgo: 2 },
    ]);

    // Delete middle session
    db.prepare("DELETE FROM events WHERE session_id = ?").run("session-2");

    // Verify other sessions are intact
    const remainingEvents = getAllEvents(db) as Array<{ session_id: string }>;
    expect(remainingEvents.length).toBe(4);

    const sessionIds = new Set(remainingEvents.map((e) => e.session_id));
    expect(sessionIds.has("session-1")).toBe(true);
    expect(sessionIds.has("session-2")).toBe(false);
    expect(sessionIds.has("session-3")).toBe(true);
  });
});

describe("getActiveEvents all mode (simulated)", () => {
  let db: Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it("should include ended sessions in 'all' mode", () => {
    db = createTestDatabase();

    // Session with SessionEnd
    seedSessionEvents(db, "ended-session", [
      { type: "SessionStart", minutesAgo: 10 },
      { type: "Stop", minutesAgo: 5 },
      { type: "SessionEnd", minutesAgo: 1 },
    ]);

    // Session still active
    seedSessionEvents(db, "active-session", [
      { type: "SessionStart", minutesAgo: 8 },
      { type: "Stop", minutesAgo: 3 },
    ]);

    // Simulate 'all' mode query (no SessionEnd exclusion)
    const queryAll = `
      SELECT *
      FROM events e1
      WHERE created_at = (
        SELECT MAX(created_at) FROM events e2
        WHERE e2.session_id = e1.session_id
      )
      ORDER BY created_at DESC
    `;

    const eventsAll = db.query(queryAll).all() as Array<{ session_id: string; event_type: string }>;

    // Both sessions should be returned
    expect(eventsAll.length).toBe(2);

    const sessionIds = eventsAll.map((e) => e.session_id);
    expect(sessionIds).toContain("ended-session");
    expect(sessionIds).toContain("active-session");

    // The ended session should show SessionEnd as latest event
    const endedSession = eventsAll.find((e) => e.session_id === "ended-session");
    expect(endedSession?.event_type).toBe("SessionEnd");
  });
});

describe("bulk delete simulation", () => {
  let db: Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it("should delete multiple sessions with IN clause", () => {
    db = createTestDatabase();

    // Create three sessions
    seedSessionEvents(db, "session-1", [
      { type: "SessionStart", minutesAgo: 15 },
      { type: "Stop", minutesAgo: 12 },
    ]);

    seedSessionEvents(db, "session-2", [
      { type: "SessionStart", minutesAgo: 10 },
      { type: "Stop", minutesAgo: 7 },
    ]);

    seedSessionEvents(db, "session-3", [
      { type: "SessionStart", minutesAgo: 5 },
      { type: "Stop", minutesAgo: 2 },
    ]);

    // Verify all sessions exist
    expect(getAllEvents(db).length).toBe(6);

    // Bulk delete sessions 1 and 2
    const sessionIdsToDelete = ["session-1", "session-2"];
    const placeholders = sessionIdsToDelete.map(() => "?").join(",");
    const result = db
      .prepare(`DELETE FROM events WHERE session_id IN (${placeholders})`)
      .run(...sessionIdsToDelete);

    expect(result.changes).toBe(4); // 2 events per session * 2 sessions

    // Verify only session-3 remains
    const remainingEvents = getAllEvents(db) as Array<{ session_id: string }>;
    expect(remainingEvents.length).toBe(2);
    for (const event of remainingEvents) {
      expect(event.session_id).toBe("session-3");
    }
  });

  it("should handle empty session list gracefully", () => {
    db = createTestDatabase();

    seedSessionEvents(db, "session-1", [
      { type: "SessionStart", minutesAgo: 10 },
      { type: "Stop", minutesAgo: 5 },
    ]);

    // No sessions to delete - this would be handled at application level
    // but we can verify the query structure is correct with a single placeholder
    const result = db
      .prepare("DELETE FROM events WHERE session_id IN (?)")
      .run("non-existent-session");

    expect(result.changes).toBe(0);

    // Original session remains
    expect(getAllEvents(db).length).toBe(2);
  });
});

describe("database queries (simulated)", () => {
  let db: Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe("getActiveEvents simulation", () => {
    it("should return latest event per session", () => {
      db = createTestDatabase();

      // Session 1: Start -> Stop
      seedSessionEvents(db, "session-1", [
        { type: "SessionStart", minutesAgo: 10 },
        { type: "Stop", minutesAgo: 5 },
      ]);

      // Session 2: Start -> Notification
      seedSessionEvents(db, "session-2", [
        { type: "SessionStart", minutesAgo: 8 },
        { type: "Notification", minutesAgo: 2 },
      ]);

      // Simulate getActiveEvents query (waiting mode)
      const query = `
        SELECT *
        FROM events e1
        WHERE created_at = (
          SELECT MAX(created_at) FROM events e2
          WHERE e2.session_id = e1.session_id
        )
        AND event_type IN ('Stop', 'Notification')
        ORDER BY created_at DESC
      `;

      const events = db.query(query).all() as Array<{ session_id: string; event_type: string }>;

      expect(events.length).toBe(2);
      // Most recent first
      expect(events[0].session_id).toBe("session-2");
      expect(events[0].event_type).toBe("Notification");
      expect(events[1].session_id).toBe("session-1");
      expect(events[1].event_type).toBe("Stop");
    });

    it("should exclude sessions that have ended", () => {
      db = createTestDatabase();

      // Session with SessionEnd
      seedSessionEvents(db, "ended-session", [
        { type: "SessionStart", minutesAgo: 10 },
        { type: "Stop", minutesAgo: 5 },
        { type: "SessionEnd", minutesAgo: 1 },
      ]);

      // Session still active
      seedSessionEvents(db, "active-session", [
        { type: "SessionStart", minutesAgo: 8 },
        { type: "Stop", minutesAgo: 3 },
      ]);

      // Simulate the exclusion logic
      const query = `
        SELECT *
        FROM events e1
        WHERE created_at = (
          SELECT MAX(created_at) FROM events e2
          WHERE e2.session_id = e1.session_id
        )
        AND event_type IN ('Stop', 'Notification')
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
        ORDER BY created_at DESC
      `;

      const events = db.query(query).all() as Array<{ session_id: string }>;

      expect(events.length).toBe(1);
      expect(events[0].session_id).toBe("active-session");
    });

    it("should include Notification:* event types in waiting mode", () => {
      db = createTestDatabase();

      // Session with Notification:idle_prompt
      seedSessionEvents(db, "session-1", [
        { type: "SessionStart", minutesAgo: 10 },
        { type: "Notification:idle_prompt", minutesAgo: 5, summary: "Idle prompt" },
      ]);

      // Session with Notification:permission_prompt
      seedSessionEvents(db, "session-2", [
        { type: "SessionStart", minutesAgo: 8 },
        { type: "Notification:permission_prompt", minutesAgo: 3, summary: "Permission prompt" },
      ]);

      // Session with plain Notification
      seedSessionEvents(db, "session-3", [
        { type: "SessionStart", minutesAgo: 6 },
        { type: "Notification", minutesAgo: 1, summary: "Plain notification" },
      ]);

      // Simulate updated getActiveEvents query (waiting mode with LIKE)
      const query = `
        SELECT *
        FROM events e1
        WHERE e1.session_id != ''
        AND created_at = (
          SELECT MAX(created_at) FROM events e2
          WHERE e2.session_id = e1.session_id
        )
        AND (event_type = 'Stop' OR event_type LIKE 'Notification%')
        ORDER BY created_at DESC
      `;

      const events = db.query(query).all() as Array<{ session_id: string; event_type: string }>;

      expect(events.length).toBe(3);
      expect(events.map((e) => e.event_type)).toContain("Notification:idle_prompt");
      expect(events.map((e) => e.event_type)).toContain("Notification:permission_prompt");
      expect(events.map((e) => e.event_type)).toContain("Notification");
    });

    it("should exclude events with empty session_id", () => {
      db = createTestDatabase();

      // Normal session
      seedSessionEvents(db, "valid-session", [
        { type: "SessionStart", minutesAgo: 10 },
        { type: "Stop", minutesAgo: 5 },
      ]);

      // Insert an event with empty session_id (corrupted data)
      const eventId = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO events (
          event_id, session_id, event_type, created_at, date_part
        ) VALUES (?, '', 'Notification', ?, ?)`,
      ).run(eventId, now, now.split("T")[0]);

      // Query with empty session_id filter
      const query = `
        SELECT *
        FROM events e1
        WHERE e1.session_id != ''
        AND created_at = (
          SELECT MAX(created_at) FROM events e2
          WHERE e2.session_id = e1.session_id
        )
        AND (event_type = 'Stop' OR event_type LIKE 'Notification%')
        ORDER BY created_at DESC
      `;

      const events = db.query(query).all() as Array<{ session_id: string }>;

      // Should only return the valid session, not the empty one
      expect(events.length).toBe(1);
      expect(events[0].session_id).toBe("valid-session");
    });
  });

  describe("recordEvent simulation", () => {
    it("should insert event with all fields", () => {
      db = createTestDatabase();

      const eventId = crypto.randomUUID();
      const sessionId = "test-session";
      const eventType = "Stop";
      const now = new Date().toISOString();
      const datePart = now.split("T")[0];
      const projectDir = "/test/project";
      const summary = "Completed task";
      const tmuxWindowId = "@3";
      const gitBranch = "main";
      const projectName = "test-project";

      db.prepare(
        `INSERT INTO events (
          event_id, session_id, event_type, created_at,
          project_dir, summary, tmux_window_id, date_part, git_branch, project_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        eventId,
        sessionId,
        eventType,
        now,
        projectDir,
        summary,
        tmuxWindowId,
        datePart,
        gitBranch,
        projectName,
      );

      const events = getAllEvents(db) as Array<{
        event_id: string;
        session_id: string;
        event_type: string;
        project_dir: string;
        summary: string;
        tmux_window_id: string;
        git_branch: string;
        project_name: string;
      }>;

      expect(events.length).toBe(1);
      expect(events[0].event_id).toBe(eventId);
      expect(events[0].session_id).toBe(sessionId);
      expect(events[0].event_type).toBe(eventType);
      expect(events[0].project_dir).toBe(projectDir);
      expect(events[0].summary).toBe(summary);
      expect(events[0].tmux_window_id).toBe(tmuxWindowId);
      expect(events[0].git_branch).toBe(gitBranch);
      expect(events[0].project_name).toBe(projectName);
    });
  });

  describe("getTmuxWindowIdForSession simulation", () => {
    it("should return tmux_window_id from SessionStart event", () => {
      db = createTestDatabase();

      seedEvent(db, {
        sessionId: "tmux-session",
        eventType: "SessionStart",
        tmuxWindowId: "@7",
      });

      // Add a Stop event without tmux_window_id
      seedEvent(db, {
        sessionId: "tmux-session",
        eventType: "Stop",
        tmuxWindowId: undefined,
      });

      const result = db
        .query(
          "SELECT tmux_window_id FROM events WHERE session_id = ? AND event_type = 'SessionStart' LIMIT 1",
        )
        .get("tmux-session") as { tmux_window_id: string | null } | null;

      expect(result?.tmux_window_id).toBe("@7");
    });

    it("should return null when no SessionStart event", () => {
      db = createTestDatabase();

      seedEvent(db, {
        sessionId: "no-start-session",
        eventType: "Stop",
      });

      const result = db
        .query(
          "SELECT tmux_window_id FROM events WHERE session_id = ? AND event_type = 'SessionStart' LIMIT 1",
        )
        .get("no-start-session") as { tmux_window_id: string | null } | null;

      expect(result).toBeNull();
    });
  });

  describe("getProcessPidForSession simulation", () => {
    it("should return process_pid from SessionStart event", () => {
      db = createTestDatabase();

      seedEvent(db, {
        sessionId: "pid-session",
        eventType: "SessionStart",
        processPid: 12345,
      });

      // Add a Stop event without process_pid
      seedEvent(db, {
        sessionId: "pid-session",
        eventType: "Stop",
      });

      const result = db
        .query(
          "SELECT process_pid FROM events WHERE session_id = ? AND event_type = 'SessionStart' LIMIT 1",
        )
        .get("pid-session") as { process_pid: number | null } | null;

      expect(result?.process_pid).toBe(12345);
    });

    it("should return null when no SessionStart event", () => {
      db = createTestDatabase();

      seedEvent(db, {
        sessionId: "no-start-session",
        eventType: "Stop",
      });

      const result = db
        .query(
          "SELECT process_pid FROM events WHERE session_id = ? AND event_type = 'SessionStart' LIMIT 1",
        )
        .get("no-start-session") as { process_pid: number | null } | null;

      expect(result).toBeNull();
    });

    it("should return null when SessionStart has no process_pid", () => {
      db = createTestDatabase();

      seedEvent(db, {
        sessionId: "no-pid-session",
        eventType: "SessionStart",
        processPid: null,
      });

      const result = db
        .query(
          "SELECT process_pid FROM events WHERE session_id = ? AND event_type = 'SessionStart' LIMIT 1",
        )
        .get("no-pid-session") as { process_pid: number | null } | null;

      expect(result?.process_pid).toBeNull();
    });
  });

  describe("recordEvent with process_pid simulation", () => {
    it("should insert event with process_pid", () => {
      db = createTestDatabase();

      const eventId = crypto.randomUUID();
      const sessionId = "test-session";
      const eventType = "SessionStart";
      const now = new Date().toISOString();
      const datePart = now.split("T")[0];
      const processPid = 54321;

      db.prepare(
        `INSERT INTO events (
          event_id, session_id, event_type, created_at,
          project_dir, summary, tmux_window_id, date_part, git_branch, project_name, process_pid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        eventId,
        sessionId,
        eventType,
        now,
        "/test/project",
        "Session started",
        null,
        datePart,
        "main",
        "test-project",
        processPid,
      );

      const events = getAllEvents(db) as Array<{
        event_type: string;
        process_pid: number | null;
      }>;

      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe("SessionStart");
      expect(events[0].process_pid).toBe(processPid);
    });

    it("should allow null process_pid for non-SessionStart events", () => {
      db = createTestDatabase();

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
        "test-session",
        "Stop",
        now,
        "/test/project",
        "Task completed",
        null,
        datePart,
        "main",
        "test-project",
        null,
      );

      const events = getAllEvents(db) as Array<{
        event_type: string;
        process_pid: number | null;
      }>;

      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe("Stop");
      expect(events[0].process_pid).toBeNull();
    });
  });
});
