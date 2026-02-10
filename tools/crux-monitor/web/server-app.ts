/**
 * Hono app factory for testability.
 *
 * This module extracts the Hono app creation into a factory function
 * that accepts dependencies, enabling unit testing with mocked session data.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { PaneContentResponse, SessionResponse } from "../shared/types";

/**
 * Dependencies for the app factory.
 * All session operations are injected to enable testing.
 */
export interface AppDependencies {
  getSessions: (filter?: string) => SessionResponse[];
  switchToPane: (paneId: string) => boolean;
  capturePaneContent?: (paneId: string) => string | null;

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
      const paneId = c.req.param("pane_id");
      const success = deps.switchToPane(paneId);
      if (success) {
        return c.json({ success: true });
      }
      return c.json({ success: false, error: "Failed to switch pane" }, 500);
    })

    // GET /api/sessions/:pane_id/pane-content
    .get("/api/sessions/:pane_id/pane-content", (c) => {
      if (!deps.capturePaneContent) {
        return c.json(
          {
            pane_id: "",
            content: null,
            timestamp: Date.now(),
          } satisfies PaneContentResponse,
          501,
        );
      }
      const paneId = c.req.param("pane_id");
      const content = deps.capturePaneContent(paneId);
      return c.json({
        pane_id: paneId,
        content,
        timestamp: Date.now(),
      } satisfies PaneContentResponse);
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

    // Favicon routes
    .get("/favicon.ico", (c) => {
      const faviconPath = join(import.meta.dirname, "public", "favicon.svg");
      const favicon = readFileSync(faviconPath);
      return c.body(favicon, 200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      });
    })
    .get("/favicon.svg", (c) => {
      const faviconPath = join(import.meta.dirname, "public", "favicon.svg");
      const favicon = readFileSync(faviconPath);
      return c.body(favicon, 200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
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
