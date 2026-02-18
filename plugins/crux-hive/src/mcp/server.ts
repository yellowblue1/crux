#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  type StartWorktreeSessionArgs,
  startWorktreeSession,
} from "./tools/start-worktree-session.js";

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
          description: "Start Claude Code in plan mode (default: false)",
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "start_worktree_session":
      return startWorktreeSession(args as unknown as StartWorktreeSessionArgs);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
