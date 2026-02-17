import type { TeamRepository } from "../domain/ports.js";

export async function deregisterMember(
  worktreePath: string,
  deps: { teamRepo: TeamRepository },
): Promise<void> {
  const worker = await deps.teamRepo.findWorkerByWorktreePath(worktreePath);
  if (!worker) return;

  const { teamName, agentName } = worker;
  await deps.teamRepo.deregisterMember(teamName, agentName);
  await deps.teamRepo.removeInbox(teamName, agentName);
}
