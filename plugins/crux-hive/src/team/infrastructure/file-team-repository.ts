import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getTeamsDir } from "../../shared/paths.js";
import type { TeamRepository } from "../domain/ports.js";
import type { TeamConfig, TeamMember } from "../domain/types.js";

function getTeamDir(teamName: string): string {
  return join(getTeamsDir(), teamName);
}

function getConfigPath(teamName: string): string {
  return join(getTeamDir(teamName), "config.json");
}

export function createFileTeamRepository(): TeamRepository {
  async function readConfig(teamName: string): Promise<TeamConfig | null> {
    const configFile = Bun.file(getConfigPath(teamName));
    if (!(await configFile.exists())) {
      return null;
    }

    try {
      const config: TeamConfig = await configFile.json();

      if (!config.name || !config.leadSessionId || !Array.isArray(config.members)) {
        throw new Error(
          `Invalid team config format: missing required fields (name, leadSessionId, members)`,
        );
      }

      return config;
    } catch (e) {
      if ((e as Error).message.includes("Invalid team config format")) {
        throw e;
      }
      return null;
    }
  }

  async function getLeadSessionId(teamName: string): Promise<string | null> {
    const config = await readConfig(teamName);
    return config?.leadSessionId ?? null;
  }

  async function registerMember(teamName: string, member: TeamMember): Promise<void> {
    // Check team existence before acquiring lock
    const config = await readConfig(teamName);
    if (!config) {
      throw new Error(`Team '${teamName}' not found. Create the team with TeamCreate first.`);
    }

    const configPath = getConfigPath(teamName);
    const lockPath = `${configPath}.lock`;

    // Acquire lock (must be synchronous for atomicity)
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    } catch {
      throw new Error(`Failed to acquire lock for team config: ${lockPath}`);
    }

    try {
      // Re-read config inside lock to avoid TOCTOU
      const freshConfig: TeamConfig = await Bun.file(configPath).json();

      // Check if member already exists
      const existingIndex = freshConfig.members.findIndex((m) => m.agentId === member.agentId);
      if (existingIndex >= 0) {
        freshConfig.members[existingIndex] = { ...freshConfig.members[existingIndex], ...member };
      } else {
        freshConfig.members.push(member);
      }

      await Bun.write(configPath, JSON.stringify(freshConfig, null, 2));
    } finally {
      // Release lock
      try {
        unlinkSync(lockPath);
      } catch {
        // Ignore lock cleanup failures
      }
    }
  }

  async function deregisterMember(teamName: string, agentName: string): Promise<boolean> {
    const config = await readConfig(teamName);
    if (!config) {
      return false;
    }

    const configPath = getConfigPath(teamName);
    const lockPath = `${configPath}.lock`;

    // Acquire lock (must be synchronous for atomicity)
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    } catch {
      throw new Error(`Failed to acquire lock for team config: ${lockPath}`);
    }

    try {
      // Re-read config inside lock to avoid TOCTOU
      const freshConfig: TeamConfig = await Bun.file(configPath).json();

      const index = freshConfig.members.findIndex((m) => m.name === agentName);
      if (index < 0) {
        return false;
      }

      freshConfig.members.splice(index, 1);
      await Bun.write(configPath, JSON.stringify(freshConfig, null, 2));
      return true;
    } finally {
      // Release lock
      try {
        unlinkSync(lockPath);
      } catch {
        // Ignore lock cleanup failures
      }
    }
  }

  async function removeInbox(teamName: string, agentName: string): Promise<boolean> {
    const inboxPath = join(getTeamDir(teamName), "inboxes", `${agentName}.json`);
    if (!(await Bun.file(inboxPath).exists())) {
      return false;
    }

    try {
      unlinkSync(inboxPath);
      return true;
    } catch {
      return false;
    }
  }

  async function createInbox(teamName: string, agentName: string): Promise<void> {
    const inboxDir = join(getTeamDir(teamName), "inboxes");
    if (!existsSync(inboxDir)) {
      mkdirSync(inboxDir, { recursive: true });
    }

    const inboxFile = Bun.file(join(inboxDir, `${agentName}.json`));
    if (!(await inboxFile.exists())) {
      await Bun.write(inboxFile, "[]");
    }
  }

  async function findWorkerByWorktreePath(
    worktreePath: string,
  ): Promise<{ teamName: string; agentName: string } | null> {
    const teamsDir = getTeamsDir();
    if (!existsSync(teamsDir)) {
      return null;
    }

    const normalizedPath = resolve(worktreePath);

    let entries: string[];
    try {
      entries = readdirSync(teamsDir);
    } catch {
      return null;
    }

    for (const teamName of entries) {
      const config = await readConfig(teamName);
      if (!config) {
        continue;
      }

      const member = config.members.find((m) => m.cwd && resolve(m.cwd) === normalizedPath);
      if (member) {
        return { teamName: config.name, agentName: member.name };
      }
    }

    return null;
  }

  return {
    readConfig,
    getLeadSessionId,
    registerMember,
    deregisterMember,
    createInbox,
    removeInbox,
    findWorkerByWorktreePath,
  };
}
