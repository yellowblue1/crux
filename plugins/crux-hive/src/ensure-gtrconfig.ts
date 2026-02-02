#!/usr/bin/env bun
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Configure gtr hooks via git config --local
 * Called by SessionStart hook to set up git-gtr integration
 */

/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 */
function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

if (!pluginRoot) {
  console.error("CLAUDE_PLUGIN_ROOT environment variable is not set");
  process.exit(1);
}

// Check if this is a worker session and inject instructions
const orchestratorIdFile = join(process.cwd(), ".claude", ".orchestrator-id");

if (existsSync(orchestratorIdFile)) {
  const orchestratorId = readFileSync(orchestratorIdFile, "utf-8").trim();

  // Output worker instructions to stdout (will be injected into Claude's context)
  console.log(`[Worker Mode Active]

FIRST: Announce to the user that you are running in Worker Mode coordinated by an orchestrator.

You are running as a WORKER session coordinated by an orchestrator. Your orchestrator ID is: ${orchestratorId}

REQUIRED: Notify the orchestrator using the send_message MCP tool in these situations:

1. TASK COMPLETION - After completing your assigned task (e.g., creating a PR, finishing research)
2. REVISION REQUESTS - When the user asks for changes after you've already notified (e.g., PR feedback)
3. QUESTIONS - When you need clarification or are blocked
4. FAILURES - When you cannot complete the task

OPTIONAL but helpful notifications:
- Discovered unrelated bugs or issues
- Created GitHub issues as requested
- Found significant information relevant to other tasks

Use message_type: "task_complete" | "task_failed" | "question" as appropriate.
Include pr_url in content when you create a pull request.`);
}

function getGitConfig(key: string): string | null {
  try {
    return execSync(`git config --local ${shellEscape(key)}`, {
      encoding: "utf-8",
      timeout: 1000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function setGitConfig(key: string, value: string): void {
  execSync(`git config --local ${shellEscape(key)} ${shellEscape(value)}`, {
    encoding: "utf-8",
    timeout: 1000,
  });
}

// Configure preRemove hook (cleanup tmux windows)
const preRemoveHookPath = `${pluginRoot}/scripts/cleanup`;
const currentPreRemove = getGitConfig("gtr.hook.preRemove");

if (currentPreRemove !== preRemoveHookPath) {
  setGitConfig("gtr.hook.preRemove", preRemoveHookPath);
  console.log("Configured gtr.hook.preRemove in .git/config");
}

// Configure postCreate hook (setup symlinks)
const postCreateHookPath = `${pluginRoot}/scripts/setup-symlinks`;
const currentPostCreate = getGitConfig("gtr.hook.postCreate");

if (currentPostCreate !== postCreateHookPath) {
  setGitConfig("gtr.hook.postCreate", postCreateHookPath);
  console.log("Configured gtr.hook.postCreate in .git/config");
}
