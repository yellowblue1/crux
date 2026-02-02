import { join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createOrchestratorSession } from "../../storage/index.js";

export interface CreateOrchestratorArgs {
  project_dir?: string;
}

/**
 * Builds the poll command for the orchestrator notification watcher.
 * Uses CLAUDE_PLUGIN_ROOT to get the plugin directory path.
 */
function buildPollCommand(orchestratorId: string): string {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) {
    // Fallback: this shouldn't happen in production but provides a useful error
    return `echo "Error: CLAUDE_PLUGIN_ROOT not set" && exit 1`;
  }
  const scriptPath = join(pluginRoot, "scripts", "poll-notifications.ts");
  return `bun run ${scriptPath} ${orchestratorId}`;
}

/**
 * Creates a new orchestrator session and returns its ID for routing messages
 */
export function createOrchestrator(args: CreateOrchestratorArgs): CallToolResult {
  const projectDir = args.project_dir || process.cwd();

  try {
    const session = createOrchestratorSession(projectDir);
    const pollCommand = buildPollCommand(session.id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              orchestrator_id: session.id,
              poll_command: pollCommand,
              project_dir: session.project_dir,
              created_at: session.created_at,
              message:
                "Orchestrator session created. Use poll_command with Task to watch for notifications.",
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
