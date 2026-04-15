#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { getErrorMessage } from "../shared/exec.js";
import {
  type StartWorktreeSessionArgs,
  startWorktreeSession,
} from "./tools/start-worktree-session.js";

function log(message: string): void {
  console.error(`[crux-mcp] ${message}`);
}

const TOOL_DEFINITIONS = [
  {
    name: "start_worktree_session",
    description:
      "Creates a git worktree and starts Claude Code in a new tmux window. Requires running inside a tmux session.",
    inputSchema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "Branch name for the worktree (e.g., 'feat/add-feature')",
        },
        fromRef: {
          type: "string",
          description: "Optional base branch/ref to create worktree from",
        },
        planMode: {
          type: "boolean",
          description:
            "Require team lead plan approval before implementation via Agent Teams (default: false)",
        },
        prompt: {
          type: "string",
          description: "Optional initial prompt for Claude Code",
        },
        pluginDir: {
          type: "string",
          description: "Optional plugin directory path for --plugin-dir flag (development/testing)",
        },
        teamName: {
          type: "string",
          description:
            "Agent Teams team name. When provided, launches the worker as a teammate with built-in SendMessage support.",
        },
        agentName: {
          type: "string",
          description: "Agent name for the teammate (required when teamName is provided)",
        },
        agentColor: {
          type: "string",
          description: "Display color for the teammate (e.g., 'blue', 'green')",
        },
        model: {
          type: "string",
          description: "Model to use for the teammate (e.g., 'sonnet', 'haiku')",
        },
        noFetch: {
          type: "boolean",
          description: "Skip git fetch before creating worktree (default: false)",
        },
      },
      required: ["branch"],
    },
  },
] as const satisfies readonly Tool[];

const server = new Server({ name: "crux", version: "5.0.0" }, { capabilities: { tools: {} } });

server.onerror = (error: Error) => {
  log(`server error: ${error.message}`);
};

server.onclose = () => {
  log("server connection closed");
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;
  log(`tool call: ${name} (start)`);

  try {
    switch (name) {
      case "start_worktree_session": {
        const result = await startWorktreeSession(args as unknown as StartWorktreeSessionArgs);
        log(`tool call: ${name} (done)`);
        return result;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    log(`tool call: ${name} (error: ${getErrorMessage(error)})`);
    throw error;
  }
});

async function shutdown(signal: string): Promise<void> {
  log(`received ${signal}, shutting down`);
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  log(`uncaught exception: ${error.message}`);
  server.close().finally(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  log(`unhandled rejection: ${reason}`);
  server.close().finally(() => process.exit(1));
});

// The SDK's StdioServerTransport does not detect stdin closing.
// Without this, the server hangs as an orphan when the client disconnects.
process.stdin.on("end", () => {
  log("stdin closed, shutting down");
  server.close().finally(() => process.exit(0));
});

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("server started");
} catch (error) {
  log(`fatal: failed to start server: ${getErrorMessage(error)}`);
  process.exit(1);
}
