import { type FSWatcher, watch } from "node:fs";
import { serveStatic } from "hono/bun";
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
import { getGcpProject } from "../src/notification/config";
import { getAccessToken } from "../src/notification/gemini";
import { type AppType, createApp, type SseClient } from "./server-app";

// In dev mode (PORT=3848), Vite handles static files
// In production (PORT=3847 or default), serve from dist/
const DEFAULT_PORT = 3847;
const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : DEFAULT_PORT;

// SSE clients
const clients: Set<SseClient> = new Set();
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
      // Check if it has our expected response structure
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
  // Group clients by mode
  const clientsByMode = new Map<FilterMode, SseClient[]>();
  for (const client of clients) {
    const modeClients = clientsByMode.get(client.mode) || [];
    modeClients.push(client);
    clientsByMode.set(client.mode, modeClients);
  }

  // Send appropriate data to each mode group
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

// Create Hono app with dependencies
const app = createApp(
  {
    getActiveEvents,
    getDbLastModified,
    deleteSession: (sessionId) => {
      const success = deleteSession(sessionId);
      if (success) {
        setTimeout(() => broadcastUpdate(), 50);
      }
      return success;
    },
    getSessionStatus,
    getPruneCandidates,
    pruneDeadSessions: () => {
      const result = pruneDeadSessions();
      if (result.deleted_count > 0) {
        setTimeout(() => broadcastUpdate(), 50);
      }
      return result;
    },
    getAccessToken,
    getGcpProject,
    onSseConnect: (client) => {
      startWatcher();
      clients.add(client);
    },
    onSseDisconnect: (client) => {
      clients.delete(client);
    },
    serializeEventsData,
  },
  { restrictCors: true },
);

// Add static file serving (Hono's serveStatic handles MIME types automatically)
const appWithStatic = app.use("/*", serveStatic({ root: "./dist" }));

// Export type for future RPC client
export type { AppType };

// Main startup
async function main() {
  // Initialize database and run migrations
  try {
    migrate();
  } catch {
    // Ignore migration errors during startup
  }

  // Check if our server is already running on the target port
  if (await isOurServerRunning(PORT)) {
    console.log(`CRUX Monitor Web UI already running at http://localhost:${PORT}`);
    process.exit(0);
  }

  // Start server
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      port: PORT,
      fetch: appWithStatic.fetch,
      idleTimeout: 255, // Max value for SSE connections
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "EADDRINUSE") {
      // Port in use by another application, try a different port
      console.error(`Port ${PORT} is in use by another application`);
      server = Bun.serve({
        port: 0,
        fetch: appWithStatic.fetch,
        idleTimeout: 255,
      });
    } else {
      throw err;
    }
  }

  console.log(`CRUX Monitor Web UI running at http://localhost:${server.port}`);

  // Start watcher on startup
  startWatcher();
}

main();
