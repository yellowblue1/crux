import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isValidTeamConfig } from "../../../shared/is-valid-team-config.js";
import { getTeamsDir } from "../../../shared/paths.js";
import type { TeamConfig } from "../../../team/domain/types.js";
import type { TeamConfigReader } from "../domain/ports.js";
import type { OrchestratorState, WorkerState } from "../domain/types.js";

export function createFileTeamReader(): TeamConfigReader {
  async function findOrchestratorTeam(sessionId: string): Promise<OrchestratorState | null> {
    const teamsDir = getTeamsDir();

    let entries: string[];
    try {
      entries = await readdir(teamsDir);
    } catch {
      return null;
    }

    for (const teamName of entries) {
      let raw: unknown;
      try {
        raw = await Bun.file(join(teamsDir, teamName, "config.json")).json();
      } catch {
        continue;
      }

      if (!isValidTeamConfig(raw)) {
        continue;
      }

      const config = raw as TeamConfig;

      if (config.leadSessionId !== sessionId) {
        continue;
      }

      const workers: WorkerState[] = config.members
        .filter((m) => m.agentId !== config.leadAgentId)
        .map((m) => ({
          name: m.name,
          isActive: typeof m.isActive === "boolean" ? m.isActive : false,
        }));

      return { teamName: config.name, workers };
    }

    return null;
  }

  return { findOrchestratorTeam };
}
