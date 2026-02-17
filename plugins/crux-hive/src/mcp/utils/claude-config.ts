import { renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface ClaudeConfig {
  projects?: {
    [path: string]: {
      hasTrustDialogAccepted?: boolean;
      enabledMcpjsonServers?: string[];
    };
  };
  [key: string]: unknown;
}

interface McpJson {
  mcpServers?: {
    [name: string]: unknown;
  };
}

/**
 * Get MCP server names from .mcp.json in the given directory
 */
export async function getMcpServersFromProject(dir: string): Promise<string[]> {
  const mcpJsonFile = Bun.file(join(dir, ".mcp.json"));

  if (!(await mcpJsonFile.exists())) {
    return [];
  }

  try {
    const mcpJson: McpJson = await mcpJsonFile.json();
    return Object.keys(mcpJson.mcpServers ?? {});
  } catch {
    return [];
  }
}

/**
 * Update ~/.claude.json to trust a worktree path and enable MCP servers
 * Uses atomic write (temp file + rename) for safety
 */
export async function updateClaudeConfig(
  worktreePath: string,
  mcpServers: string[],
): Promise<void> {
  const claudeJsonPath = join(homedir(), ".claude.json");
  const claudeJsonFile = Bun.file(claudeJsonPath);

  if (!(await claudeJsonFile.exists())) {
    return;
  }

  try {
    const config: ClaudeConfig = await claudeJsonFile.json();

    // Initialize projects if not exists
    if (!config.projects) {
      config.projects = {};
    }

    // Initialize project entry if not exists
    if (!config.projects[worktreePath]) {
      config.projects[worktreePath] = {};
    }

    // Set trust dialog and MCP servers
    config.projects[worktreePath].hasTrustDialogAccepted = true;
    config.projects[worktreePath].enabledMcpjsonServers = mcpServers;

    // Atomic write: write to temp file, then rename
    const tempPath = `${claudeJsonPath}.tmp`;
    await Bun.write(tempPath, JSON.stringify(config, null, 2));
    renameSync(tempPath, claudeJsonPath);
  } catch (e) {
    // Ignore errors - failing to update config is not critical
    console.error("Failed to update ~/.claude.json:", e);
  }
}
