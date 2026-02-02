import { join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Diagnostic tool to check environment variables and import.meta in MCP server context.
 * This is useful for debugging path resolution issues.
 */
export function debugEnv(): CallToolResult {
  const pluginRootFromEnv = process.env.CLAUDE_PLUGIN_ROOT || "(not set)";

  // Calculate plugin root from import.meta
  const importMetaDir = import.meta.dir;
  const pluginRootFromMeta = join(importMetaDir, "..", "..", "..");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            environment: {
              CLAUDE_PLUGIN_ROOT: pluginRootFromEnv,
              NODE_ENV: process.env.NODE_ENV || "(not set)",
              HOME: process.env.HOME || "(not set)",
            },
            import_meta: {
              dir: importMetaDir,
              file: import.meta.file,
              path: import.meta.path,
            },
            calculated: {
              plugin_root: pluginRootFromMeta,
              poll_script_path: join(pluginRootFromMeta, "scripts", "poll-notifications.ts"),
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}
