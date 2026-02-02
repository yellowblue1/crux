/**
 * Compiled server entry point for standalone binary distribution.
 *
 * This file is used when building the standalone binary with `bun build --compile`.
 * It serves embedded static files from embed.generated.ts instead of using serveStatic.
 */

import { type FSWatcher, watch } from "node:fs";
import { parseArgs } from "node:util";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  dbExists,
  deleteSession,
  type FilterMode,
  getActiveEvents,
  getDbLastModified,
  getDbPath,
  getPruneCandidates,
  getSessionStatus,
  migrate,
  pruneDeadSessions,
} from "../src/db";
import { embeddedAssets } from "./embed.generated";

// Parse CLI arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: {
      type: "string",
      short: "p",
      default: "3847",
    },
  },
});

const PORT = Number.parseInt(values.port ?? "3847", 10);

// SSE clients
interface SSEClient {
  controller: ReadableStreamDefaultController;
  mode: FilterMode;
}
const clients: Set<SSEClient> = new Set();
let watcher: FSWatcher | null = null;
let debounceTimer: Timer | null = null;

// Check if a crux-monitor server is already running on the port
async function isOurServerRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/api/events`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      const data = await response.json();
      return "events" in data && "last_modified" in data;
    }
  } catch {
    // Connection failed or timeout - server not running
  }
  return false;
}

function serializeEventsData(mode: FilterMode): string {
  return JSON.stringify({
    events: getActiveEvents(mode),
    last_modified: getDbLastModified(),
  });
}

function broadcastUpdate() {
  const clientsByMode = new Map<FilterMode, SSEClient[]>();
  for (const client of clients) {
    const modeClients = clientsByMode.get(client.mode) || [];
    modeClients.push(client);
    clientsByMode.set(client.mode, modeClients);
  }

  for (const [mode, modeClients] of clientsByMode) {
    const data = serializeEventsData(mode);
    const message = `data: ${data}\n\n`;

    for (const client of modeClients) {
      try {
        client.controller.enqueue(new TextEncoder().encode(message));
      } catch {
        clients.delete(client);
      }
    }
  }
}

function startWatcher() {
  if (watcher) return;

  const dbPath = getDbPath();
  if (!dbExists()) {
    console.log("Database not found, will retry when accessed");
    return;
  }

  try {
    watcher = watch(dbPath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        broadcastUpdate();
      }, 100);
    });
    console.log(`Watching database: ${dbPath}`);
  } catch (err) {
    console.error("Failed to watch database:", err);
  }
}

// Create Hono app with chain-style API
const app = new Hono()
  .use("/*", cors())

  // GET /api/events
  .get("/api/events", (c) => {
    const mode = (c.req.query("mode") || "waiting") as FilterMode;
    return c.json({
      events: getActiveEvents(mode),
      last_modified: getDbLastModified(),
    });
  })

  // DELETE /api/sessions/:id
  .delete("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const success = deleteSession(sessionId);
    if (success) {
      setTimeout(() => broadcastUpdate(), 50);
      return c.json({ success: true });
    }
    return c.json({ success: false, error: "Failed to delete session" }, 500);
  })

  // GET /api/sessions/:id/status
  .get("/api/sessions/:id/status", (c) => {
    const sessionId = c.req.param("id");
    return c.json(getSessionStatus(sessionId));
  })

  // GET /api/prune/preview
  .get("/api/prune/preview", (c) => {
    const candidates = getPruneCandidates();
    return c.json({ count: candidates.length, sessions: candidates });
  })

  // POST /api/prune
  .post("/api/prune", (c) => {
    const result = pruneDeadSessions();
    if (result.deleted_count > 0) {
      setTimeout(() => broadcastUpdate(), 50);
    }
    return c.json(result);
  })

  // SSE endpoint
  .get("/api/events/stream", (c) => {
    startWatcher();
    const mode = (c.req.query("mode") || "waiting") as FilterMode;
    let client: SSEClient;

    const stream = new ReadableStream({
      start(controller) {
        client = { controller, mode };
        clients.add(client);
        controller.enqueue(new TextEncoder().encode(`data: ${serializeEventsData(mode)}\n\n`));
      },
      cancel() {
        clients.delete(client);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  })

  // Serve embedded static files
  .get("/*", (c) => {
    const urlPath = c.req.path || "/";
    const asset = embeddedAssets[urlPath] || embeddedAssets["/index.html"];

    if (asset) {
      return new Response(Bun.file(asset.path), {
        headers: { "Content-Type": asset.mime },
      });
    }

    return c.notFound();
  });

export type AppType = typeof app;

// Main startup
async function main() {
  try {
    migrate();
  } catch {
    // Ignore migration errors during startup
  }

  if (await isOurServerRunning(PORT)) {
    console.log(`CRUX Monitor Web UI already running at http://localhost:${PORT}`);
    process.exit(0);
  }

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      port: PORT,
      fetch: app.fetch,
      idleTimeout: 255,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "EADDRINUSE") {
      console.error(`Port ${PORT} is in use by another application`);
      server = Bun.serve({
        port: 0,
        fetch: app.fetch,
        idleTimeout: 255,
      });
    } else {
      throw err;
    }
  }

  console.log(`CRUX Monitor Web UI running at http://localhost:${server.port}`);
  startWatcher();
}

main();
