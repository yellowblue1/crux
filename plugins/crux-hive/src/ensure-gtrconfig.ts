#!/usr/bin/env bun
import { exec, execOrThrow, shellEscape } from "./mcp/utils/exec.js";

/**
 * Configure gtr hooks via git config --local
 * Called by SessionStart hook to set up git-gtr integration
 */

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

if (!pluginRoot) {
  console.error("CLAUDE_PLUGIN_ROOT environment variable is not set");
  process.exit(1);
}

function getGitConfig(key: string): string | null {
  const result = exec(`git config --local ${shellEscape(key)}`, { timeout: 1000 });
  return result.success ? result.stdout || null : null;
}

function setGitConfig(key: string, value: string): void {
  execOrThrow(`git config --local ${shellEscape(key)} ${shellEscape(value)}`, { timeout: 1000 });
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
