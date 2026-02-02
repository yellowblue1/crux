/**
 * Hono app factory for testability.
 *
 * This module extracts the Hono app creation into a factory function
 * that accepts dependencies, enabling unit testing with mocked database.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { FilterMode } from "../src/db";

/**
 * Dependencies for the app factory.
 * All database operations are injected to enable testing.
 */
export interface AppDependencies {
  // Database operations
  getActiveEvents: (mode: FilterMode) => unknown[];
  getDbLastModified: () => number;
  deleteSession: (sessionId: string) => boolean;
  getSessionStatus: (sessionId: string) => unknown;
  getPruneCandidates: () => unknown[];
  pruneDeadSessions: () => { deleted_count: number; deleted_sessions: string[] };

  // Auth status (optional, for compiled binary without gemini)
  getAccessToken?: () => string | null;
  getGcpProject?: () => string | null;

  // SSE callbacks (optional)
  onSseConnect?: (client: SseClient) => void;
  onSseDisconnect?: (client: SseClient) => void;
  serializeEventsData?: (mode: FilterMode) => string;
}

/**
 * SSE client interface for connection tracking
 */
export interface SseClient {
  controller: ReadableStreamDefaultController;
  mode: FilterMode;
}

/**
 * Options for app creation
 */
export interface CreateAppOptions {
  /** Enable localhost-only CORS (default: true for server.ts, false for compiled) */
  restrictCors?: boolean;
  /** Static file handler (optional, for production serving) */
  staticHandler?: (c: unknown) => Response | Promise<Response>;
}

/**
 * Creates a Hono app with injected dependencies.
 *
 * This factory enables:
 * - Unit testing with mocked database
 * - Shared route definitions between server.ts and server-compiled.ts
 * - Type-safe RPC client via AppType export
 */
export function createApp(deps: AppDependencies, options: CreateAppOptions = {}) {
  const { restrictCors = true } = options;

  const app = new Hono()
    // CORS middleware
    .use(
      "/*",
      cors(
        restrictCors
          ? {
              origin: (origin) => {
                // Allow requests with no origin (same-origin, curl, etc.)
                if (!origin) return origin;
                // Only allow localhost origins (with any port)
                const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
                if (localhostPattern.test(origin)) {
                  return origin;
                }
                // Reject other origins
                return null;
              },
            }
          : undefined,
      ),
    )

    // GET /api/events
    .get("/api/events", (c) => {
      const mode = (c.req.query("mode") || "waiting") as FilterMode;
      return c.json({
        events: deps.getActiveEvents(mode),
        last_modified: deps.getDbLastModified(),
      });
    })

    // DELETE /api/sessions/:id
    .delete("/api/sessions/:id", (c) => {
      const sessionId = c.req.param("id");
      const success = deps.deleteSession(sessionId);
      if (success) {
        return c.json({ success: true });
      }
      return c.json({ success: false, error: "Failed to delete session" }, 500);
    })

    // GET /api/sessions/:id/status
    .get("/api/sessions/:id/status", (c) => {
      const sessionId = c.req.param("id");
      return c.json(deps.getSessionStatus(sessionId));
    })

    // GET /api/prune/preview
    .get("/api/prune/preview", (c) => {
      const candidates = deps.getPruneCandidates();
      return c.json({ count: candidates.length, sessions: candidates });
    })

    // POST /api/prune
    .post("/api/prune", (_c) => {
      const result = deps.pruneDeadSessions();
      return _c.json(result);
    })

    // GET /api/auth/status
    .get("/api/auth/status", (c) => {
      const gcloudAuthenticated = deps.getAccessToken?.() !== null;
      const gcpProjectConfigured = deps.getGcpProject?.() !== null;
      const aiSummaryAvailable = gcloudAuthenticated && gcpProjectConfigured;

      return c.json({
        gcloud_authenticated: gcloudAuthenticated,
        gcp_project_configured: gcpProjectConfigured,
        ai_summary_available: aiSummaryAvailable,
      });
    })

    // SSE endpoint
    .get("/api/events/stream", (c) => {
      const mode = (c.req.query("mode") || "waiting") as FilterMode;
      let client: SseClient;

      const stream = new ReadableStream({
        start(controller) {
          client = { controller, mode };
          deps.onSseConnect?.(client);

          // Send initial data
          const data = deps.serializeEventsData?.(mode) ?? "{}";
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        },
        cancel() {
          deps.onSseDisconnect?.(client);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    });

  return app;
}

/**
 * App type for RPC client usage
 */
export type AppType = ReturnType<typeof createApp>;
