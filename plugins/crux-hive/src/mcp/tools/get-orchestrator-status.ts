import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getNotificationCount, getOrchestratorSession } from "../../storage/index.js";

export interface GetOrchestratorStatusArgs {
  orchestrator_id: string;
}

/**
 * Gets the status of an orchestrator session including unread message count
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
    const session = getOrchestratorSession(orchestrator_id);

    if (!session) {
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

    const counts = getNotificationCount(orchestrator_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              orchestrator_id,
              unread_count: counts.unread,
              total_messages: counts.total,
              created_at: session.created_at,
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
