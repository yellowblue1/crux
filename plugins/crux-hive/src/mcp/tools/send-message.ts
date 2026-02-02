import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  getOrchestratorSession,
  type MessageContent,
  type MessageType,
  writeNotification,
} from "../../storage/index.js";

/**
 * Find the git repository root directory
 * Falls back to process.cwd() if not in a git repo
 */
function findGitRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Reads orchestrator ID from .claude/.orchestrator-id file
 */
function readOrchestratorIdFromFile(): string | null {
  const idFilePath = join(findGitRoot(), ".claude", ".orchestrator-id");
  if (!existsSync(idFilePath)) {
    return null;
  }
  try {
    return readFileSync(idFilePath, "utf-8").trim();
  } catch {
    return null;
  }
}

export interface SendMessageArgs {
  message_type: MessageType;
  content: MessageContent;
  worker_id?: string;
}

/**
 * Sends a message from a worker to an orchestrator
 */
export function sendMessage(args: SendMessageArgs): CallToolResult {
  const { message_type, content, worker_id } = args;

  // Read orchestrator_id from file
  const orchestratorId = readOrchestratorIdFromFile();
  if (!orchestratorId) {
    return {
      content: [
        {
          type: "text",
          text: "Error: .claude/.orchestrator-id file not found",
        },
      ],
      isError: true,
    };
  }

  if (!message_type) {
    return {
      content: [{ type: "text", text: "Error: message_type is required" }],
      isError: true,
    };
  }

  const validTypes: MessageType[] = ["task_complete", "task_failed", "question"];
  if (!validTypes.includes(message_type)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: message_type must be one of: ${validTypes.join(", ")}`,
        },
      ],
      isError: true,
    };
  }

  if (!content || typeof content !== "object") {
    return {
      content: [
        {
          type: "text",
          text: "Error: content must be an object with at least a summary field",
        },
      ],
      isError: true,
    };
  }

  try {
    // Verify orchestrator exists
    const orchestrator = getOrchestratorSession(orchestratorId);
    if (!orchestrator) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Orchestrator session '${orchestratorId}' not found`,
          },
        ],
        isError: true,
      };
    }

    const message = writeNotification(orchestratorId, worker_id, message_type, content);

    // Mark notification as sent so stop hook doesn't block again
    const markerPath = join(findGitRoot(), ".claude", ".notification-sent");
    writeFileSync(markerPath, new Date().toISOString());

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message_id: message.id,
              orchestrator_id: message.orchestrator_id,
              message_type: message.message_type,
              created_at: message.created_at,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error sending message: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
