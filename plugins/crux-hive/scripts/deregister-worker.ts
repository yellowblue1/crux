#!/usr/bin/env bun
/**
 * Deregisters a worker from Agent Teams config before worktree removal.
 * Called by the cleanup hook with the worktree path as argument.
 *
 * Reads .crux-hive-worker.json from the worktree to find teamName/agentName,
 * then removes the member from config.json and deletes the inbox file.
 *
 * Exits with 0 in all cases to never block worktree removal.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deregisterTeamMember, removeInbox } from "../src/mcp/utils/agent-teams.js";

const worktreePath = process.argv[2];
if (!worktreePath) {
  process.exit(0);
}

const metadataPath = join(worktreePath, ".crux-hive-worker.json");
if (!existsSync(metadataPath)) {
  // Not a team worker — nothing to do
  process.exit(0);
}

try {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
  const { teamName, agentName } = metadata;

  if (!teamName || !agentName) {
    process.exit(0);
  }

  deregisterTeamMember(teamName, agentName);
  removeInbox(teamName, agentName);
} catch {
  // Never block worktree removal
}

process.exit(0);
