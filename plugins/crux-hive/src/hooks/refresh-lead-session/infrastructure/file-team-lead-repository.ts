import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isValidTeamConfig } from "../../../shared/is-valid-team-config.js";
import { getTeamsDir } from "../../../shared/paths.js";
import { isValidName } from "../../../shared/validators.js";
import type { TeamConfig } from "../../../team/domain/types.js";
import type { TeamLeadRepository } from "../domain/ports.js";
import type { TeamLeadSummary } from "../domain/types.js";

function getConfigPath(teamName: string): string {
  if (!isValidName(teamName)) {
    throw new Error(`Invalid team name: '${teamName}' contains unsafe characters`);
  }
  return join(getTeamsDir(), teamName, "config.json");
}

async function readLeadSummary(teamName: string): Promise<TeamLeadSummary | null> {
  if (!isValidName(teamName)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = await Bun.file(getConfigPath(teamName)).json();
  } catch {
    return null;
  }

  if (!isValidTeamConfig(raw)) {
    return null;
  }

  const leadMember = raw.members.find((m) => m.agentId === raw.leadAgentId);
  if (!leadMember || typeof leadMember.cwd !== "string") {
    return null;
  }

  return { teamName: raw.name, leadSessionId: raw.leadSessionId, leadCwd: leadMember.cwd };
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

  async function updateLeadSessionId(
    teamName: string,
    expectedStaleSessionId: string,
    newLeadSessionId: string,
  ): Promise<boolean> {
    const configPath = getConfigPath(teamName);
    const lockPath = `${configPath}.lock`;

    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    } catch {
      throw new Error(`Failed to acquire lock for team config: ${lockPath}`);
    }

    try {
      const rawFresh: unknown = await Bun.file(configPath).json();
      // Minimal check inside the lock: we only need leadSessionId to be a
      // string so the CAS comparison is meaningful. Member-level validation
      // already ran in listTeamLeads; redoing it here would pay per-prompt
      // cost for no additional guarantee.
      if (
        !rawFresh ||
        typeof rawFresh !== "object" ||
        typeof (rawFresh as { leadSessionId?: unknown }).leadSessionId !== "string"
      ) {
        return false;
      }
      const freshConfig = rawFresh as TeamConfig;
      // CAS: bail out when another session has already refreshed leadSessionId
      // between listTeamLeads() and lock acquisition.
      if (freshConfig.leadSessionId !== expectedStaleSessionId) {
        return false;
      }
      // Mutate in place so fields crux-hive does not track (e.g. joinedAt,
      // subscriptions) survive the round trip.
      freshConfig.leadSessionId = newLeadSessionId;
      await Bun.write(configPath, JSON.stringify(freshConfig, null, 2));
      return true;
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
