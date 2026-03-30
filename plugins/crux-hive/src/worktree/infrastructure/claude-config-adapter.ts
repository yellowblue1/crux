import { renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigAdapter } from "../domain/ports.js";

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

export function createClaudeConfigAdapter(homeDir?: string): ConfigAdapter {
  const home = homeDir ?? homedir();
  return {
    async getMcpServersFromProject(dir: string): Promise<string[]> {
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
    },

    async updateClaudeConfig(worktreePath: string, mcpServers: string[]): Promise<void> {
      const claudeJsonPath = join(home, ".claude.json");
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
    },

    async readWorkerInstructions(projectDir: string): Promise<string | null> {
      try {
        const globalPath = join(home, ".crux", "worker-instructions.md");
        const projectPath = join(projectDir, ".crux", "worker-instructions.md");

        const globalFile = Bun.file(globalPath);
        const projectFile = Bun.file(projectPath);

        const [globalExists, projectExists] = await Promise.all([
          globalFile.exists(),
          projectFile.exists(),
        ]);

        if (!globalExists && !projectExists) {
          return null;
        }

        const parts: string[] = [];

        if (globalExists) {
          const content = (await globalFile.text()).trim();
          if (content) {
            parts.push(content);
          }
        }

        if (projectExists) {
          const content = (await projectFile.text()).trim();
          if (content) {
            parts.push(content);
          }
        }

        return parts.length > 0 ? parts.join("\n\n") : null;
      } catch {
        return null;
      }
    },
  };
}
