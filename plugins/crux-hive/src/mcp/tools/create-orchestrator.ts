import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createOrchestratorSession } from "../../storage/index.js";

export interface CreateOrchestratorArgs {
  project_dir?: string;
}

/**
 * Creates a new orchestrator session and returns its ID for routing messages
 */
export function createOrchestrator(args: CreateOrchestratorArgs): CallToolResult {
  const projectDir = args.project_dir || process.cwd();

  try {
    const session = createOrchestratorSession(projectDir);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              orchestrator_id: session.id,
              project_dir: session.project_dir,
              created_at: session.created_at,
              message: "Orchestrator session created. Use this ID when starting worker sessions.",
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
          text: `Error creating orchestrator session: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
