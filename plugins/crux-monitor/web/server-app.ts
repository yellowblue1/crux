/**
 * Hono app factory for testability.
 *
 * This module extracts the Hono app creation into a factory function
 * that accepts dependencies, enabling unit testing with mocked session data.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { SessionResponse } from "../shared/types";

/**
 * Dependencies for the app factory.
 * All session operations are injected to enable testing.
 */
export interface AppDependencies {
  getSessions: (filter?: string) => SessionResponse[];
  switchToPane: (paneId: string) => boolean;

  // Auth status
  getAccessToken?: () => string | null;
  getGcpProject?: () => string | null;

  // SSE callbacks
  onSseConnect?: (client: SseClient) => void;
  onSseDisconnect?: (client: SseClient) => void;
  serializeSessionsData?: () => string;
}

/**
 * SSE client interface for connection tracking
 */
export interface SseClient {
  controller: ReadableStreamDefaultController;
}

/**
 * Options for app creation
 */
export interface CreateAppOptions {
  restrictCors?: boolean;
}

/**
 * Creates a Hono app with injected dependencies.
 */
export function createApp(deps: AppDependencies, options: CreateAppOptions = {}) {
  const { restrictCors = true } = options;

  const app = new Hono()
    .use(
      "/*",
      cors(
        restrictCors
          ? {
              origin: (origin) => {
                if (!origin) return origin;
                const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
                if (localhostPattern.test(origin)) {
                  return origin;
                }
                return null;
              },
            }
          : undefined,
      ),
    )

    // GET /api/sessions
    .get("/api/sessions", (c) => {
      return c.json({
        sessions: deps.getSessions(),
        timestamp: Date.now(),
      });
    })

    // POST /api/sessions/:pane_id/jump
    .post("/api/sessions/:pane_id/jump", (c) => {
      const paneId = decodeURIComponent(c.req.param("pane_id"));
      const success = deps.switchToPane(paneId);
      if (success) {
        return c.json({ success: true });
      }
      return c.json({ success: false, error: "Failed to switch pane" }, 500);
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
    .get("/api/sessions/stream", (_c) => {
      let client: SseClient;

      const stream = new ReadableStream({
        start(controller) {
          client = { controller };
          deps.onSseConnect?.(client);

          // Send initial data
          const data = deps.serializeSessionsData?.() ?? "{}";
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
