import type { TeamLeadSummary } from "./types.js";

export type TeamLeadRepository = {
  listTeamLeads(): Promise<TeamLeadSummary[]>;
  /**
   * Atomically replace leadSessionId, but only when the on-disk value still
   * equals `expectedStaleSessionId` (compare-and-swap). Returns true when the
   * write happened, false when another process already changed it.
   */
  updateLeadSessionId(
    teamName: string,
    expectedStaleSessionId: string,
    newLeadSessionId: string,
  ): Promise<boolean>;
};

export type LiveSessionReader = {
  listLiveSessionIds(): Promise<ReadonlySet<string>>;
};
