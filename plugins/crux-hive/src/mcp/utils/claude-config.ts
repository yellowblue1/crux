import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
export function getMcpServersFromProject(dir: string): string[] {
  const mcpJsonPath = join(dir, ".mcp.json");

  if (!existsSync(mcpJsonPath)) {
    return [];
  }

  try {
    const content = readFileSync(mcpJsonPath, "utf-8");
    const mcpJson: McpJson = JSON.parse(content);
    return Object.keys(mcpJson.mcpServers ?? {});
  } catch {
    return [];
  }
}

/**
 * Update ~/.claude.json to trust a worktree path and enable MCP servers
 * Uses atomic write (temp file + rename) for safety
 */
export function updateClaudeConfig(worktreePath: string, mcpServers: string[]): void {
  const claudeJsonPath = join(homedir(), ".claude.json");

  if (!existsSync(claudeJsonPath)) {
    return;
  }

  try {
    const content = readFileSync(claudeJsonPath, "utf-8");
    const config: ClaudeConfig = JSON.parse(content);

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
    writeFileSync(tempPath, JSON.stringify(config, null, 2));
    renameSync(tempPath, claudeJsonPath);
  } catch (e) {
    // Ignore errors - failing to update config is not critical
    console.error("Failed to update ~/.claude.json:", e);
  }
}
