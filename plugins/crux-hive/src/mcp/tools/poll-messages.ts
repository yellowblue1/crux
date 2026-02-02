import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getOrchestratorSession, pollNotifications } from "../../storage/index.js";

export interface PollMessagesArgs {
  orchestrator_id: string;
}

/**
 * Polls for unread messages and marks them as read
 */
export function pollMessages(args: PollMessagesArgs): CallToolResult {
  const { orchestrator_id } = args;

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

    const messages = pollNotifications(orchestrator_id);

    // Format messages for output
    const formattedMessages = messages.map((msg) => ({
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
              message_count: formattedMessages.length,
              messages: formattedMessages,
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
          text: `Error polling messages: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
