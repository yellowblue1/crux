import { serveStatic } from "hono/bun";
import { getGcpProject } from "../src/notification/config";
import { generatePaneSummary, getAccessToken } from "../src/notification/gemini";
import { SessionManager } from "../src/session/manager";
import { switchToPane } from "../src/tmux/utils";
import { type AppType, createApp, type SseClient } from "./server-app";

const DEFAULT_PORT = 3847;
const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : DEFAULT_PORT;

// SSE clients
const clients: Set<SseClient> = new Set();

// Session manager with tmux polling
const sessionManager = new SessionManager({
  generateSummary: generatePaneSummary,
});

function serializeSessionsData(): string {
  return JSON.stringify({
    sessions: sessionManager.getSessions(),
    timestamp: Date.now(),
  });
}

function broadcastUpdate() {
  const data = serializeSessionsData();
  const message = `data: ${data}\n\n`;

  for (const client of clients) {
    try {
      client.controller.enqueue(new TextEncoder().encode(message));
    } catch {
      clients.delete(client);
    }
  }
}

// Broadcast when session state changes
sessionManager.onChange(() => {
  broadcastUpdate();
});

// Check if a crux-monitor server is already running on the port
async function isOurServerRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/api/sessions`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      const data = await response.json();
      return "sessions" in data && "timestamp" in data;
    }
  } catch {
    // Connection failed or timeout - server not running
  }
  return false;
}

// Create Hono app with dependencies
const app = createApp(
  {
    getSessions: (filter) => sessionManager.getSessions(filter),
    switchToPane,
    getAccessToken,
    getGcpProject,
    onSseConnect: (client) => {
      clients.add(client);
    },
    onSseDisconnect: (client) => {
      clients.delete(client);
    },
    serializeSessionsData,
  },
  { restrictCors: true },
);

// Add static file serving
const appWithStatic = app.use("/*", serveStatic({ root: "./dist" }));

// Export type for future RPC client
export type { AppType };

// Main startup
async function main() {
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
      idleTimeout: 255,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "EADDRINUSE") {
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

  // Start session polling
  sessionManager.start();
}

main();
