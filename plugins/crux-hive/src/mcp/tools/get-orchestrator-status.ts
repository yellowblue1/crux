import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getOrchestratorSession } from "../../storage/index.js";

export interface GetOrchestratorStatusArgs {
  orchestrator_id: string;
}

/**
 * Gets the status of an orchestrator session including unread message count.
 */
export function getOrchestratorStatus(args: GetOrchestratorStatusArgs): CallToolResult {
  const { orchestrator_id } = args;

  if (!orchestrator_id) {
    return {
      content: [{ type: "text", text: "Error: orchestrator_id is required" }],
      isError: true,
    };
  }

  try {
    const orchestrator = getOrchestratorSession(orchestrator_id);
    if (!orchestrator) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Orchestrator session '${orchestrator_id}' not found`,
          },
        ],
        isError: true,
      };
    }

    // Count unread notifications
    const notificationsDir = join(tmpdir(), orchestrator_id, "notifications");
    let unreadCount = 0;

    if (existsSync(notificationsDir)) {
      const files = readdirSync(notificationsDir).filter((f) => f.endsWith(".json"));
      unreadCount = files.length;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              orchestrator_id,
              project_dir: orchestrator.project_dir,
              created_at: orchestrator.created_at,
              unread_count: unreadCount,
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
          text: `Error getting orchestrator status: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
