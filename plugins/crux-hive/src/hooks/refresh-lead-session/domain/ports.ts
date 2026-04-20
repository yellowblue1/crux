import type { TeamLeadSummary } from "./types.js";

export type TeamLeadRepository = {
  listTeamLeads(): Promise<TeamLeadSummary[]>;
  updateLeadSessionId(teamName: string, newLeadSessionId: string): Promise<void>;
};
