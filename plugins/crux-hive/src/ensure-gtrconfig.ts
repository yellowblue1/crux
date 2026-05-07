#!/usr/bin/env bun
/**
 * Configure gtr hooks via git config --local
 * Called by SessionStart hook to set up git-gtr integration
 */

import { configureGtrHooks } from "./hooks/configure-gtr-hooks.js";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

if (!pluginRoot) {
  console.error("CLAUDE_PLUGIN_ROOT environment variable is not set");
  process.exit(1);
}

configureGtrHooks(pluginRoot);
