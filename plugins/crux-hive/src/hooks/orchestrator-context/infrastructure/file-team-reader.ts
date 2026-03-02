import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getTeamsDir } from "../../../shared/paths.js";
import type { TeamConfig } from "../../../team/domain/types.js";
import type { TeamConfigReader } from "../domain/ports.js";
import type { OrchestratorState, WorkerState } from "../domain/types.js";

function isValidConfig(raw: unknown): raw is TeamConfig {
  return (
    raw !== null &&
    typeof raw === "object" &&
    "name" in raw &&
    typeof (raw as Record<string, unknown>).name === "string" &&
    "leadAgentId" in raw &&
    typeof (raw as Record<string, unknown>).leadAgentId === "string" &&
    "leadSessionId" in raw &&
    typeof (raw as Record<string, unknown>).leadSessionId === "string" &&
    "members" in raw &&
    Array.isArray((raw as Record<string, unknown>).members)
  );
}

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

      if (!isValidConfig(raw)) {
        continue;
      }

      if (raw.leadSessionId !== sessionId) {
        continue;
      }

      const workers: WorkerState[] = raw.members
        .filter((m) => m.agentId !== raw.leadAgentId)
        .map((m) => ({
          name: m.name,
          isActive: typeof m.isActive === "boolean" ? m.isActive : false,
        }));

      return { teamName: raw.name, workers };
    }

    return null;
  }

  return { findOrchestratorTeam };
}
