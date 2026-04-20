import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isValidTeamConfig } from "../../../shared/is-valid-team-config.js";
import { getTeamsDir } from "../../../shared/paths.js";
import type { TeamConfig } from "../../../team/domain/types.js";
import type { TeamLeadRepository } from "../domain/ports.js";
import type { TeamLeadSummary } from "../domain/types.js";

function getConfigPath(teamName: string): string {
  return join(getTeamsDir(), teamName, "config.json");
}

async function readLeadSummary(teamName: string): Promise<TeamLeadSummary | null> {
  let raw: unknown;
  try {
    raw = await Bun.file(getConfigPath(teamName)).json();
  } catch {
    return null;
  }

  if (!isValidTeamConfig(raw)) {
    return null;
  }

  const config = raw as TeamConfig;
  const leadMember = config.members.find((m) => m.agentId === config.leadAgentId);
  if (!leadMember || typeof leadMember.cwd !== "string") {
    return null;
  }

  return { teamName: config.name, leadSessionId: config.leadSessionId, leadCwd: leadMember.cwd };
}

export function createFileTeamLeadRepository(): TeamLeadRepository {
  async function listTeamLeads(): Promise<TeamLeadSummary[]> {
    const teamsDir = getTeamsDir();
    if (!existsSync(teamsDir)) {
      return [];
    }

    let entries: string[];
    try {
      entries = readdirSync(teamsDir);
    } catch {
      return [];
    }

    const summaries = await Promise.all(entries.map(readLeadSummary));
    return summaries.filter((s): s is TeamLeadSummary => s !== null);
  }

  async function updateLeadSessionId(teamName: string, newLeadSessionId: string): Promise<void> {
    const configPath = getConfigPath(teamName);
    const lockPath = `${configPath}.lock`;

    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    } catch {
      throw new Error(`Failed to acquire lock for team config: ${lockPath}`);
    }

    try {
      const freshConfig: TeamConfig = await Bun.file(configPath).json();
      if (freshConfig.leadSessionId === newLeadSessionId) {
        return;
      }
      freshConfig.leadSessionId = newLeadSessionId;
      await Bun.write(configPath, JSON.stringify(freshConfig, null, 2));
    } finally {
      try {
        unlinkSync(lockPath);
      } catch {
        // Ignore lock cleanup failures
      }
    }
  }

  return { listTeamLeads, updateLeadSessionId };
}
