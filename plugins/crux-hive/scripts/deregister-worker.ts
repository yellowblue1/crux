#!/usr/bin/env bun
/**
 * Deregisters a worker from Agent Teams config before worktree removal.
 * Called by the cleanup hook with the worktree path as argument.
 *
 * Looks up the worker by scanning team configs for a member whose cwd
 * matches the worktree path, then removes the member and inbox.
 *
 * Exits with 0 in all cases to never block worktree removal.
 */

import {
  deregisterTeamMember,
  findWorkerByWorktreePath,
  removeInbox,
} from "../src/mcp/utils/agent-teams.js";

const worktreePath = process.argv[2];
if (!worktreePath) {
  process.exit(0);
}

try {
  const worker = await findWorkerByWorktreePath(worktreePath);
  if (!worker) {
    // Not a team worker or already cleaned up
    process.exit(0);
  }

  const { teamName, agentName } = worker;
  await deregisterTeamMember(teamName, agentName);
  await removeInbox(teamName, agentName);
} catch {
  // Never block worktree removal
}

process.exit(0);
