/**
 * Hono API integration tests.
 *
 * Tests all API endpoints using app.request() without starting an HTTP server.
 * Database dependencies are mocked for isolation.
 */

import { describe, expect, it, mock } from "bun:test";
import { type AppDependencies, createApp, type SseClient } from "./server-app";

// Create mock dependencies for testing
function createMockDeps(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    getActiveEvents: () => [],
    getDbLastModified: () => 1706000000000,
    deleteSession: () => true,
    getSessionStatus: () => ({ exists: true, status: "running" }),
    getPruneCandidates: () => [],
    pruneDeadSessions: () => ({ deleted_count: 0, deleted_sessions: [] }),
    getAccessToken: () => "mock-token",
    getGcpProject: () => "mock-project",
    ...overrides,
  };
}

describe("Hono API endpoints", () => {
  describe("GET /api/events", () => {
    it("returns events with last_modified timestamp", async () => {
      const mockEvents = [
        { id: 1, event_id: "evt-1", session_id: "sess-1", event_type: "Stop" },
        { id: 2, event_id: "evt-2", session_id: "sess-2", event_type: "Notification" },
      ];

      const deps = createMockDeps({
        getActiveEvents: () => mockEvents,
        getDbLastModified: () => 1706123456789,
      });

      const app = createApp(deps);
      const res = await app.request("/api/events");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.events).toEqual(mockEvents);
      expect(data.last_modified).toBe(1706123456789);
    });

    it("passes mode query parameter to getActiveEvents", async () => {
      const getActiveEventsSpy = mock(() => []);
      const deps = createMockDeps({ getActiveEvents: getActiveEventsSpy });

      const app = createApp(deps);

      // Test 'waiting' mode (default)
      await app.request("/api/events");
      expect(getActiveEventsSpy).toHaveBeenLastCalledWith("waiting");

      // Test 'active' mode
      await app.request("/api/events?mode=active");
      expect(getActiveEventsSpy).toHaveBeenLastCalledWith("active");

      // Test 'all' mode
      await app.request("/api/events?mode=all");
      expect(getActiveEventsSpy).toHaveBeenLastCalledWith("all");
    });

    it("returns empty array when no events", async () => {
      const deps = createMockDeps({ getActiveEvents: () => [] });
      const app = createApp(deps);

      const res = await app.request("/api/events");
      const data = await res.json();

      expect(data.events).toEqual([]);
    });
  });

  describe("DELETE /api/sessions/:id", () => {
    it("returns success when session is deleted", async () => {
      const deleteSessionSpy = mock(() => true);
      const deps = createMockDeps({ deleteSession: deleteSessionSpy });
      const app = createApp(deps);

      const res = await app.request("/api/sessions/test-session-123", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(deleteSessionSpy).toHaveBeenCalledWith("test-session-123");
    });

    it("returns 500 error when deletion fails", async () => {
      const deps = createMockDeps({ deleteSession: () => false });
      const app = createApp(deps);

      const res = await app.request("/api/sessions/nonexistent", {
        method: "DELETE",
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Failed to delete session");
    });
  });

  describe("GET /api/sessions/:id/status", () => {
    it("returns session status for existing session", async () => {
      const mockStatus = { exists: true, status: "running", pid: 12345 };
      const getSessionStatusSpy = mock(() => mockStatus);
      const deps = createMockDeps({ getSessionStatus: getSessionStatusSpy });
      const app = createApp(deps);

      const res = await app.request("/api/sessions/active-session/status");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(mockStatus);
      expect(getSessionStatusSpy).toHaveBeenCalledWith("active-session");
    });

    it("returns status for orphaned session", async () => {
      const mockStatus = { exists: false, status: "orphaned" };
      const deps = createMockDeps({ getSessionStatus: () => mockStatus });
      const app = createApp(deps);

      const res = await app.request("/api/sessions/dead-session/status");
      const data = await res.json();

      expect(data.exists).toBe(false);
      expect(data.status).toBe("orphaned");
    });
  });

  describe("GET /api/prune/preview", () => {
    it("returns empty list when no prune candidates", async () => {
      const deps = createMockDeps({ getPruneCandidates: () => [] });
      const app = createApp(deps);

      const res = await app.request("/api/prune/preview");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.count).toBe(0);
      expect(data.sessions).toEqual([]);
    });

    it("returns prune candidates with count", async () => {
      const candidates = [
        { session_id: "sess-1", project_name: "project-a", last_event: "2024-01-01" },
        { session_id: "sess-2", project_name: "project-b", last_event: "2024-01-02" },
        { session_id: "sess-3", project_name: "project-c", last_event: "2024-01-03" },
      ];
      const deps = createMockDeps({ getPruneCandidates: () => candidates });
      const app = createApp(deps);

      const res = await app.request("/api/prune/preview");
      const data = await res.json();

      expect(data.count).toBe(3);
      expect(data.sessions).toEqual(candidates);
    });
  });

  describe("POST /api/prune", () => {
    it("returns result when no sessions pruned", async () => {
      const deps = createMockDeps({
        pruneDeadSessions: () => ({ deleted_count: 0, deleted_sessions: [] }),
      });
      const app = createApp(deps);

      const res = await app.request("/api/prune", { method: "POST" });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deleted_count).toBe(0);
      expect(data.deleted_sessions).toEqual([]);
    });

    it("returns deleted session information", async () => {
      const pruneResult = {
        deleted_count: 2,
        deleted_sessions: ["sess-1", "sess-2"],
      };
      const deps = createMockDeps({ pruneDeadSessions: () => pruneResult });
      const app = createApp(deps);

      const res = await app.request("/api/prune", { method: "POST" });
      const data = await res.json();

      expect(data.deleted_count).toBe(2);
      expect(data.deleted_sessions).toContain("sess-1");
      expect(data.deleted_sessions).toContain("sess-2");
    });
  });

  describe("GET /api/auth/status", () => {
    it("returns all true when both authenticated and configured", async () => {
      const deps = createMockDeps({
        getAccessToken: () => "valid-token",
        getGcpProject: () => "my-project",
      });
      const app = createApp(deps);

      const res = await app.request("/api/auth/status");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gcloud_authenticated).toBe(true);
      expect(data.gcp_project_configured).toBe(true);
      expect(data.ai_summary_available).toBe(true);
    });

    it("returns false when not authenticated", async () => {
      const deps = createMockDeps({
        getAccessToken: () => null,
        getGcpProject: () => "my-project",
      });
      const app = createApp(deps);

      const res = await app.request("/api/auth/status");
      const data = await res.json();

      expect(data.gcloud_authenticated).toBe(false);
      expect(data.gcp_project_configured).toBe(true);
      expect(data.ai_summary_available).toBe(false);
    });

    it("returns false when project not configured", async () => {
      const deps = createMockDeps({
        getAccessToken: () => "valid-token",
        getGcpProject: () => null,
      });
      const app = createApp(deps);

      const res = await app.request("/api/auth/status");
      const data = await res.json();

      expect(data.gcloud_authenticated).toBe(true);
      expect(data.gcp_project_configured).toBe(false);
      expect(data.ai_summary_available).toBe(false);
    });

    it("returns all false when neither authenticated nor configured", async () => {
      const deps = createMockDeps({
        getAccessToken: () => null,
        getGcpProject: () => null,
      });
      const app = createApp(deps);

      const res = await app.request("/api/auth/status");
      const data = await res.json();

      expect(data.gcloud_authenticated).toBe(false);
      expect(data.gcp_project_configured).toBe(false);
      expect(data.ai_summary_available).toBe(false);
    });
  });

  describe("GET /api/events/stream (SSE)", () => {
    it("returns SSE response headers", async () => {
      const deps = createMockDeps({
        serializeEventsData: () => '{"events":[],"last_modified":0}',
      });
      const app = createApp(deps);

      const res = await app.request("/api/events/stream");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
      expect(res.headers.get("Connection")).toBe("keep-alive");
    });

    it("calls onSseConnect with client info", async () => {
      const onSseConnectSpy = mock((_client: SseClient) => {});
      const deps = createMockDeps({
        onSseConnect: onSseConnectSpy,
        serializeEventsData: () => "{}",
      });
      const app = createApp(deps);

      await app.request("/api/events/stream?mode=active");

      expect(onSseConnectSpy).toHaveBeenCalled();
      const client = onSseConnectSpy.mock.calls[0][0];
      expect(client.mode).toBe("active");
    });

    it("sends initial data on connection", async () => {
      const initialData = '{"events":[{"id":1}],"last_modified":123}';
      const deps = createMockDeps({
        serializeEventsData: () => initialData,
      });
      const app = createApp(deps);

      const res = await app.request("/api/events/stream");
      const reader = res.body?.getReader();
      const result = await reader?.read();
      const text = new TextDecoder().decode(result?.value);

      expect(text).toContain(`data: ${initialData}`);
      expect(text).toContain("\n\n");
    });
  });
});

describe("CORS behavior", () => {
  describe("with restrictCors: true (default)", () => {
    it("allows localhost origin", async () => {
      const deps = createMockDeps();
      const app = createApp(deps, { restrictCors: true });

      const res = await app.request("/api/events", {
        headers: { Origin: "http://localhost:3847" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3847");
    });

    it("allows 127.0.0.1 origin", async () => {
      const deps = createMockDeps();
      const app = createApp(deps, { restrictCors: true });

      const res = await app.request("/api/events", {
        headers: { Origin: "http://127.0.0.1:8080" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:8080");
    });

    it("allows https localhost origin", async () => {
      const deps = createMockDeps();
      const app = createApp(deps, { restrictCors: true });

      const res = await app.request("/api/events", {
        headers: { Origin: "https://localhost:3000" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost:3000");
    });

    it("rejects external origin", async () => {
      const deps = createMockDeps();
      const app = createApp(deps, { restrictCors: true });

      const res = await app.request("/api/events", {
        headers: { Origin: "https://evil.com" },
      });

      // CORS middleware returns null origin for rejected requests
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("rejects origin with localhost in subdomain", async () => {
      const deps = createMockDeps();
      const app = createApp(deps, { restrictCors: true });

      const res = await app.request("/api/events", {
        headers: { Origin: "https://localhost.evil.com" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("allows requests with no origin (same-origin/curl)", async () => {
      const deps = createMockDeps();
      const app = createApp(deps, { restrictCors: true });

      const res = await app.request("/api/events");

      // No CORS header needed for same-origin requests
      expect(res.status).toBe(200);
    });
  });

  describe("with restrictCors: false (compiled binary)", () => {
    it("allows any origin", async () => {
      const deps = createMockDeps();
      const app = createApp(deps, { restrictCors: false });

      const res = await app.request("/api/events", {
        headers: { Origin: "https://any-origin.com" },
      });

      // Default CORS allows all origins
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});

describe("HTTP methods", () => {
  it("handles preflight OPTIONS request", async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const res = await app.request("/api/events", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3847",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("returns 404 for unknown routes", async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const res = await app.request("/api/unknown");

    expect(res.status).toBe(404);
  });
});
