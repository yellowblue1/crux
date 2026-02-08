import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface TeamMember {
  agentId: string;
  name: string;
  agentType: string;
  model?: string;
  color?: string;
  tmuxPaneId?: string;
  backendType?: string;
  isActive?: boolean;
  cwd?: string;
}

export interface TeamConfig {
  name: string;
  leadAgentId: string;
  leadSessionId: string;
  members: TeamMember[];
}

function getTeamsDir(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".claude", "teams");
}

function getTeamDir(teamName: string): string {
  return join(getTeamsDir(), teamName);
}

function getConfigPath(teamName: string): string {
  return join(getTeamDir(teamName), "config.json");
}

/**
 * Reads the Agent Teams config.json for a given team.
 * Returns null if the team does not exist or the config is unreadable.
 */
export function readTeamConfig(teamName: string): TeamConfig | null {
  const configPath = getConfigPath(teamName);
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config: TeamConfig = JSON.parse(content);

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

/**
 * Gets the lead session ID from the team config.
 * This is required for --parent-session-id when launching teammates.
 */
export function getLeadSessionId(teamName: string): string | null {
  const config = readTeamConfig(teamName);
  return config?.leadSessionId ?? null;
}

/**
 * Registers a new team member in the team config.json.
 * Uses a lock file to prevent concurrent writes.
 */
export function registerTeamMember(teamName: string, member: TeamMember): void {
  // Check team existence before acquiring lock
  const config = readTeamConfig(teamName);
  if (!config) {
    throw new Error(`Team '${teamName}' not found. Create the team with TeamCreate first.`);
  }

  const configPath = getConfigPath(teamName);
  const lockPath = `${configPath}.lock`;

  // Acquire lock
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  } catch {
    throw new Error(`Failed to acquire lock for team config: ${lockPath}`);
  }

  try {
    // Check if member already exists
    const existingIndex = config.members.findIndex((m) => m.agentId === member.agentId);
    if (existingIndex >= 0) {
      config.members[existingIndex] = member;
    } else {
      config.members.push(member);
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } finally {
    // Release lock
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore lock cleanup failures
    }
  }
}

/**
 * Deregisters a team member from the team config.json.
 * Uses a lock file to prevent concurrent writes.
 * Returns true if the member was found and removed, false otherwise (idempotent).
 */
export function deregisterTeamMember(teamName: string, agentName: string): boolean {
  const config = readTeamConfig(teamName);
  if (!config) {
    return false;
  }

  const configPath = getConfigPath(teamName);
  const lockPath = `${configPath}.lock`;

  // Acquire lock
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  } catch {
    throw new Error(`Failed to acquire lock for team config: ${lockPath}`);
  }

  try {
    // Re-read config inside lock to avoid TOCTOU
    const freshContent = readFileSync(configPath, "utf-8");
    const freshConfig: TeamConfig = JSON.parse(freshContent);

    const index = freshConfig.members.findIndex((m) => m.name === agentName);
    if (index < 0) {
      return false;
    }

    freshConfig.members.splice(index, 1);
    writeFileSync(configPath, JSON.stringify(freshConfig, null, 2));
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

/**
 * Removes the inbox file for a teammate.
 * Returns true if the file was found and removed, false otherwise (idempotent).
 */
export function removeInbox(teamName: string, agentName: string): boolean {
  const inboxPath = join(getTeamDir(teamName), "inboxes", `${agentName}.json`);
  if (!existsSync(inboxPath)) {
    return false;
  }

  try {
    unlinkSync(inboxPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates the inbox file for a teammate.
 * Agent Teams uses these files for message delivery.
 */
export function createInbox(teamName: string, agentName: string): void {
  const inboxDir = join(getTeamDir(teamName), "inboxes");
  if (!existsSync(inboxDir)) {
    mkdirSync(inboxDir, { recursive: true });
  }

  const inboxPath = join(inboxDir, `${agentName}.json`);
  if (!existsSync(inboxPath)) {
    writeFileSync(inboxPath, "[]");
  }
}

/**
 * Finds a worker's teamName and agentName by looking up the worktree path
 * across all team configs. Returns null if no matching worker is found.
 */
export function findWorkerByWorktreePath(
  worktreePath: string,
): { teamName: string; agentName: string } | null {
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
    const config = readTeamConfig(teamName);
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
