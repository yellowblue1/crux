#!/usr/bin/env bun
/**
 * Version Sync Validation Script
 *
 * Validates that plugin.json and package.json versions are in sync
 * for all plugins in the monorepo.
 *
 * Exit codes:
 *   0 - All versions are in sync
 *   1 - Version mismatch detected
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface VersionInfo {
  pluginJson: string | null;
  packageJson: string | null;
}

async function readJsonVersion(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const json = JSON.parse(content) as { version?: string };
    return json.version ?? null;
  } catch {
    return null;
  }
}

async function getPluginVersions(pluginDir: string): Promise<VersionInfo> {
  const pluginJsonPath = join(pluginDir, ".claude-plugin", "plugin.json");
  const packageJsonPath = join(pluginDir, "package.json");

  const [pluginJson, packageJson] = await Promise.all([
    readJsonVersion(pluginJsonPath),
    readJsonVersion(packageJsonPath),
  ]);

  return { pluginJson, packageJson };
}

async function main(): Promise<void> {
  const pluginsDir = join(import.meta.dir, "..", "plugins");
  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const plugins = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let hasErrors = false;
  const results: Array<{
    plugin: string;
    versions: VersionInfo;
    status: "ok" | "mismatch" | "missing";
  }> = [];

  for (const plugin of plugins) {
    const pluginDir = join(pluginsDir, plugin);
    const versions = await getPluginVersions(pluginDir);

    let status: "ok" | "mismatch" | "missing";
    if (!versions.pluginJson || !versions.packageJson) {
      status = "missing";
      // Only flag as error if plugin.json exists but package.json version is missing
      if (versions.pluginJson && !versions.packageJson) {
        hasErrors = true;
      }
    } else if (versions.pluginJson !== versions.packageJson) {
      status = "mismatch";
      hasErrors = true;
    } else {
      status = "ok";
    }

    results.push({ plugin, versions, status });
  }

  // Output results
  console.log("Plugin Version Sync Check");
  console.log("=".repeat(50));

  for (const { plugin, versions, status } of results) {
    const icon = status === "ok" ? "\u2713" : status === "mismatch" ? "\u2717" : "?";
    console.log(`\n${icon} ${plugin}`);
    console.log(`  plugin.json:  ${versions.pluginJson ?? "not found"}`);
    console.log(`  package.json: ${versions.packageJson ?? "not found"}`);

    if (status === "mismatch") {
      console.log(`  ERROR: Versions do not match!`);
    }
  }

  console.log(`\n${"=".repeat(50)}`);

  if (hasErrors) {
    console.log("FAILED: Version sync errors detected");
    process.exit(1);
  } else {
    console.log("PASSED: All plugin versions are in sync");
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error("Error:", err);
  process.exit(1);
});
