import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TeamConfigReader } from "../domain/ports.js";
import type { OrchestratorState, WorkerState } from "../domain/types.js";

function getTeamsDir(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".claude", "teams");
}

function isValidConfig(
  raw: unknown,
): raw is { name: string; leadAgentId: string; leadSessionId: string; members: unknown[] } {
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
      entries = readdirSync(teamsDir);
    } catch {
      return null;
    }

    for (const teamName of entries) {
      const configFile = Bun.file(join(teamsDir, teamName, "config.json"));
      if (!(await configFile.exists())) {
        continue;
      }

      let raw: unknown;
      try {
        raw = await configFile.json();
      } catch {
        continue;
      }

      if (!isValidConfig(raw)) {
        continue;
      }

      if (raw.leadSessionId !== sessionId) {
        continue;
      }

      const workers: WorkerState[] = (raw.members as Record<string, unknown>[])
        .filter((m) => typeof m.agentId === "string" && m.agentId !== raw.leadAgentId)
        .map((m) => ({
          name: String(m.name),
          isActive: (m.isActive as boolean) ?? false,
        }));

      return { teamName: raw.name, workers };
    }

    return null;
  }

  return { findOrchestratorTeam };
}
