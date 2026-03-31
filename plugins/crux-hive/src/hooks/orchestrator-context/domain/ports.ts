import type { OrchestratorState } from "./types.js";

export type TeamConfigReader = {
  findOrchestratorTeam(sessionId: string): Promise<OrchestratorState | null>;
};

export type CruxMarkdownReader = {
  readOrchestratorSettings(projectDir: string): Promise<string | null>;
};
