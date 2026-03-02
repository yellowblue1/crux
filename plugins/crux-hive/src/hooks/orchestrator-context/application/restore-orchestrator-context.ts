import { buildOrchestratorContext } from "../domain/build-context.js";
import type { TeamConfigReader } from "../domain/ports.js";

type RestoreOrchestratorContextDeps = {
  readonly teamConfigReader: TeamConfigReader;
};

export async function restoreOrchestratorContext(
  sessionId: string,
  deps: RestoreOrchestratorContextDeps,
): Promise<string | null> {
  const state = await deps.teamConfigReader.findOrchestratorTeam(sessionId);
  if (!state) {
    return null;
  }
  return buildOrchestratorContext(state);
}
