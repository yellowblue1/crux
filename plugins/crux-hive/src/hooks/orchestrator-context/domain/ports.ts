import type { OrchestratorState } from "./types.js";

export type TeamConfigReader = {
  findOrchestratorTeam(sessionId: string): Promise<OrchestratorState | null>;
};
