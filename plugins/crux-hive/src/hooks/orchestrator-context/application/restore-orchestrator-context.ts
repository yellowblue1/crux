import { buildOrchestratorContext } from "../domain/build-context.js";
import type { CruxMarkdownReader, TeamConfigReader } from "../domain/ports.js";

type RestoreOrchestratorContextDeps = {
  readonly teamConfigReader: TeamConfigReader;
  readonly cruxMarkdownReader: CruxMarkdownReader;
};

export async function restoreOrchestratorContext(
  sessionId: string,
  projectDir: string,
  deps: RestoreOrchestratorContextDeps,
): Promise<string | null> {
  const state = await deps.teamConfigReader.findOrchestratorTeam(sessionId);
  if (!state) {
    return null;
  }

  const customSettings = await deps.cruxMarkdownReader.readOrchestratorSettings(projectDir);

  return buildOrchestratorContext(customSettings ? { ...state, customSettings } : state);
}
