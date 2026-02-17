import type { TeamConfig, TeamMember } from "./types.js";

export interface TeamRepository {
  readConfig(teamName: string): Promise<TeamConfig | null>;
  getLeadSessionId(teamName: string): Promise<string | null>;
  registerMember(teamName: string, member: TeamMember): Promise<void>;
  deregisterMember(teamName: string, agentName: string): Promise<boolean>;
  createInbox(teamName: string, agentName: string): Promise<void>;
  removeInbox(teamName: string, agentName: string): Promise<boolean>;
  findWorkerByWorktreePath(
    worktreePath: string,
  ): Promise<{ teamName: string; agentName: string } | null>;
}
