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

import { deregisterMember } from "../src/team/application/deregister-member.js";
import { createFileTeamRepository } from "../src/team/infrastructure/file-team-repository.js";

const worktreePath = process.argv[2];
if (!worktreePath) {
  process.exit(0);
}

try {
  await deregisterMember(worktreePath, { teamRepo: createFileTeamRepository() });
} catch {
  // Never block worktree removal
}

process.exit(0);
