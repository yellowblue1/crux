import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TeamConfig } from "../../../team/domain/types.js";
import type { TeamConfigReader } from "../domain/ports.js";
import type { OrchestratorState, WorkerState } from "../domain/types.js";

function getTeamsDir(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".claude", "teams");
}

export function createFileTeamReader(): TeamConfigReader {
  async function findOrchestratorTeam(sessionId: string): Promise<OrchestratorState | null> {
    const teamsDir = getTeamsDir();
    if (!existsSync(teamsDir)) {
      return null;
    }

    let entries: string[];
    try {
      entries = readdirSync(teamsDir);
    } catch {
      return null;
    }

    for (const teamName of entries) {
      const configFile = Bun.file(join(teamsDir, teamName, "config.json"));
      if (!(await configFile.exists())) {
        continue;
      }

      let config: TeamConfig;
      try {
        config = await configFile.json();
      } catch {
        continue;
      }

      if (config.leadSessionId !== sessionId) {
        continue;
      }

      if (!config.name || !Array.isArray(config.members)) {
        continue;
      }

      const workers: WorkerState[] = config.members
        .filter((m) => m.agentId !== config.leadAgentId)
        .map((m) => ({
          name: m.name,
          isActive: m.isActive ?? false,
          cwd: m.cwd,
        }));

      return { teamName: config.name, workers };
    }

    return null;
  }

  return { findOrchestratorTeam };
}
