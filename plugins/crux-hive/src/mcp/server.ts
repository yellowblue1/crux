#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { type CreateOrchestratorArgs, createOrchestrator } from "./tools/create-orchestrator.js";
import {
  type GetOrchestratorStatusArgs,
  getOrchestratorStatus,
} from "./tools/get-orchestrator-status.js";
import { type PollMessagesArgs, pollMessages } from "./tools/poll-messages.js";
import { type SendMessageArgs, sendMessage } from "./tools/send-message.js";
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
      type: "object" as const,
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
        orchestratorId: {
          type: "string",
          description: "Optional orchestrator session ID for worker->orchestrator messaging",
        },
      },
      required: ["branch"],
    },
  },
  {
    name: "create_orchestrator_session",
    description:
      "Creates a new orchestrator session for coordinating worker tasks. Returns an orchestrator_id to use with start_worktree_session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_dir: {
          type: "string",
          description: "Project directory (defaults to current working directory)",
        },
      },
      required: [],
    },
  },
  {
    name: "send_message",
    description: `REQUIRED: Workers MUST call this tool to notify the orchestrator. There is NO automatic detection.

Call when:
- After creating a pull request (include pr_url)
- After updating a pull request
- When research/investigation completes
- When blocked or have questions (message_type: 'question')
- When task fails (message_type: 'task_failed')

The orchestrator cannot see your work until you call this tool.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        message_type: {
          type: "string",
          enum: ["task_complete", "task_failed", "question"],
          description: "Type of message being sent",
        },
        content: {
          type: "object",
          description:
            "Message content with summary, and optional details, pr_url, branch, error, question fields",
          properties: {
            summary: { type: "string", description: "Brief summary of the message" },
            details: { type: "string", description: "Additional details" },
            pr_url: { type: "string", description: "Pull request URL if applicable" },
            branch: { type: "string", description: "Git branch name" },
            error: { type: "string", description: "Error message if task_failed" },
            question: { type: "string", description: "Question text if asking" },
          },
          required: ["summary"],
        },
        worker_id: {
          type: "string",
          description: "Optional worker identifier",
        },
      },
      required: ["message_type", "content"],
    },
  },
  {
    name: "poll_messages",
    description:
      "Polls for unread messages from workers and marks them as read. Use in a background subagent to receive notifications.",
    inputSchema: {
      type: "object" as const,
      properties: {
        orchestrator_id: {
          type: "string",
          description: "The orchestrator session ID to poll messages for",
        },
      },
      required: ["orchestrator_id"],
    },
  },
  {
    name: "get_orchestrator_status",
    description: "Gets the status of an orchestrator session including unread message count.",
    inputSchema: {
      type: "object" as const,
      properties: {
        orchestrator_id: {
          type: "string",
          description: "The orchestrator session ID to check status for",
        },
      },
      required: ["orchestrator_id"],
    },
  },
];

const server = new Server({ name: "crux", version: "4.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "start_worktree_session":
      return startWorktreeSession(args as unknown as StartWorktreeSessionArgs);
    case "create_orchestrator_session":
      return createOrchestrator(args as unknown as CreateOrchestratorArgs);
    case "send_message":
      return sendMessage(args as unknown as SendMessageArgs);
    case "poll_messages":
      return pollMessages(args as unknown as PollMessagesArgs);
    case "get_orchestrator_status":
      return getOrchestratorStatus(args as unknown as GetOrchestratorStatusArgs);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
