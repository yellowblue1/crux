import { join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createOrchestratorSession } from "../../storage/index.js";

export interface CreateOrchestratorArgs {
  project_dir?: string;
}

/**
 * Get the plugin root directory using import.meta.
 * This file is at: plugins/crux-hive/src/mcp/tools/create-orchestrator.ts
 * Plugin root is at: plugins/crux-hive/
 */
function getPluginRoot(): string {
  // import.meta.dir gives the directory of this file (src/mcp/tools)
  // Navigate up 3 levels: tools -> mcp -> src -> crux-hive (plugin root)
  return join(import.meta.dir, "..", "..", "..");
}

/**
 * Builds the poll command for the orchestrator notification watcher.
 * Uses import.meta to determine the plugin directory path.
 */
function buildPollCommand(orchestratorId: string): string {
  const pluginRoot = getPluginRoot();
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
                "Orchestrator session created. Use poll_command with Bash (run_in_background: true) to watch for notifications.",
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
