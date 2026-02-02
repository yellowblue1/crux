# Hono Features Analysis - CRUX Monitor

This document analyzes the Hono web framework usage in crux-monitor and provides recommendations for testing and improvements.

## Table of Contents

1. [Current Implementation](#current-implementation)
2. [API Endpoint Reference](#api-endpoint-reference)
3. [Architecture Decisions](#architecture-decisions)
4. [Recommendations](#recommendations)

---

## Current Implementation

### Hono Version

- **Installed**: Hono 4.11.7 (via `hono@^4.7.0`)
- **Status**: Near-latest, includes all CVE fixes through late 2024

### Features Used

| Feature | Usage | Location |
|---------|-------|----------|
| Chain-style API | Routes defined via `.get()`, `.post()`, `.delete()` chaining | `server.ts:105-206` |
| CORS middleware | Localhost-only origin policy | `server.ts:108-123` |
| Static file serving | `serveStatic({ root: "./dist" })` | `server.ts:206` |
| JSON responses | `c.json()` for all API responses | All endpoints |
| Route parameters | `c.req.param("id")` | Session endpoints |
| Query parameters | `c.req.query("mode")` | Events endpoints |
| AppType export | Ready for RPC client | `server.ts:209` |

### Server Configuration

```typescript
Bun.serve({
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 255,  // Max value for SSE long-lived connections
});
```

---

## API Endpoint Reference

### GET /api/events

Returns active events filtered by mode.

**Query Parameters:**
- `mode` (optional): `"waiting"` | `"active"` | `"all"` (default: `"waiting"`)

**Response:**
```json
{
  "events": [/* EventResponse[] */],
  "last_modified": 1706000000000
}
```

### DELETE /api/sessions/:id

Deletes all events for a session.

**Path Parameters:**
- `id`: Session ID

**Response:**
```json
{ "success": true }
// or on error:
{ "success": false, "error": "Failed to delete session" }
```

### GET /api/sessions/:id/status

Returns process status for a session.

**Path Parameters:**
- `id`: Session ID

**Response:**
```json
{
  "exists": true,
  "status": "running" | "ended" | "orphaned"
}
```

### GET /api/prune/preview

Returns sessions eligible for cleanup.

**Response:**
```json
{
  "count": 3,
  "sessions": [/* PruneCandidate[] */]
}
```

### POST /api/prune

Executes cleanup of dead sessions.

**Response:**
```json
{
  "deleted_count": 3,
  "deleted_sessions": ["session-1", "session-2", "session-3"]
}
```

### GET /api/auth/status

Returns authentication status for AI features.

**Response:**
```json
{
  "gcloud_authenticated": true,
  "gcp_project_configured": true,
  "ai_summary_available": true
}
```

### GET /api/events/stream (SSE)

Server-Sent Events endpoint for real-time updates.

**Query Parameters:**
- `mode` (optional): `"waiting"` | `"active"` | `"all"` (default: `"waiting"`)

**Response:** SSE stream with `data: {...}` messages on database changes.

---

## Architecture Decisions

### Chain-Style API

**Decision:** Use Hono's method chaining instead of separate route handlers.

**Rationale:**
- Preserves full TypeScript type inference across all routes
- Enables `AppType` export for potential RPC client usage
- Single source of truth for route definitions

**Example:**
```typescript
const app = new Hono()
  .get("/api/events", (c) => c.json({ events: getActiveEvents() }))
  .delete("/api/sessions/:id", (c) => { /* ... */ });

export type AppType = typeof app;
```

### CORS Configuration

**Decision:** Restrict CORS to localhost origins only.

**Rationale:**
- Prevents cross-origin attacks from malicious websites
- crux-monitor is a local development tool, external access unnecessary
- More secure than wildcard CORS (`*`)

**Implementation:**
```typescript
cors({
  origin: (origin) => {
    if (!origin) return origin;  // Same-origin, curl
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    return localhostPattern.test(origin) ? origin : null;
  },
})
```

### Manual SSE Implementation

**Decision:** Use manual `ReadableStream` instead of Hono's streaming helpers.

**Rationale:**
- Broadcast pattern requires managing multiple client connections
- Manual control enables per-client filter mode tracking
- Works well with database file watcher triggering updates

**Implementation:**
```typescript
.get("/api/events/stream", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      clients.add({ controller, mode });
      controller.enqueue(encoder.encode(`data: ${data}\n\n`));
    },
    cancel() {
      clients.delete(client);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
})
```

### Compiled Binary Variant

**Decision:** Maintain separate `server-compiled.ts` for standalone binary.

**Rationale:**
- `serveStatic` doesn't work in compiled binaries (no filesystem access)
- Embedded assets are pre-loaded via `embed.generated.ts`
- Simpler CORS for CLI distribution (wildcard OK)

---

## Recommendations

### Implemented

1. **API Integration Tests** (`web/server.test.ts`)
   - Test all 7 endpoints using `app.request()`
   - Mock database dependencies for isolation
   - Verify CORS behavior

2. **Testable App Factory** (`web/server-app.ts`)
   - Extract app creation to `createApp(deps)` function
   - Enable dependency injection for testing
   - Shared by both server.ts and server-compiled.ts

### Deferred (Low Value for Internal Tool)

| Feature | Reason for Deferral |
|---------|---------------------|
| **RPC Client** | Overkill for single consumer (dashboard). AppType already exported if needed later. |
| **Zod Validators** | Internal API with shared TypeScript types. Runtime validation adds complexity without benefit. |
| **Route Reorganization** | Single-file approach appropriate for 7 endpoints. Splitting adds overhead without maintainability gains. |
| **OpenAPI Spec** | No external consumers. TypeScript provides sufficient documentation. |

### Future Considerations

If the API grows significantly:

1. **Hono RPC Client** - Use `hc<AppType>("/")` for type-safe client calls
2. **Route Groups** - Split into `routes/events.ts`, `routes/sessions.ts`
3. **Valibot Schemas** - Share validation between client and server

---

## Testing Strategy

### Unit Tests with app.request()

Hono's `app.request()` enables fast testing without starting an HTTP server:

```typescript
import { describe, expect, it, mock } from "bun:test";
import { createApp } from "./server-app";

// Mock database module
mock.module("../src/db", () => ({
  getActiveEvents: () => [{ id: 1, event_type: "Stop" }],
  getDbLastModified: () => 1706000000000,
}));

describe("GET /api/events", () => {
  it("returns events with last_modified", async () => {
    const app = createApp();
    const res = await app.request("/api/events");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(1);
    expect(data.last_modified).toBe(1706000000000);
  });
});
```

### CORS Testing

```typescript
it("allows localhost origins", async () => {
  const res = await app.request("/api/events", {
    headers: { Origin: "http://localhost:3847" },
  });
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3847");
});

it("rejects external origins", async () => {
  const res = await app.request("/api/events", {
    headers: { Origin: "https://evil.com" },
  });
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
});
```

---

## References

- [Hono Documentation](https://hono.dev/)
- [Hono RPC Client](https://hono.dev/docs/guides/rpc)
- [Hono Testing](https://hono.dev/docs/guides/testing)
- [Bun.serve() Options](https://bun.sh/docs/api/http#options)
