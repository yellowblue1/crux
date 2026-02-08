#!/usr/bin/env bun
import { execSync } from "node:child_process";

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
