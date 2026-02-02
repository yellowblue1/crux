import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getOrchestratorSession, readNotifications } from "../../storage/index.js";

export interface PollNotificationsArgs {
  orchestrator_id: string;
  cleanup?: boolean;
}

/**
 * Polls for notifications from workers and optionally removes them after reading.
 * Returns all pending notifications for the specified orchestrator.
 */
export function pollNotifications(args: PollNotificationsArgs): CallToolResult {
  const { orchestrator_id, cleanup = true } = args;

  if (!orchestrator_id) {
    return {
      content: [{ type: "text", text: "Error: orchestrator_id is required" }],
      isError: true,
    };
  }

  try {
    // Verify orchestrator exists
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

    const notifications = readNotifications(orchestrator_id, cleanup);

    // Format for output
    const formatted = notifications.map((msg) => ({
      id: msg.id,
      worker_id: msg.worker_id,
      message_type: msg.message_type,
      content: msg.content,
      created_at: msg.created_at,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              orchestrator_id,
              notification_count: formatted.length,
              notifications: formatted,
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
          text: `Error polling notifications: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
