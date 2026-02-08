#!/usr/bin/env bun

import { loadConfig } from "./config.js";
import { formatFailureMessage, runQualityGates } from "./quality-gate.js";

/**
 * TeammateIdle hook handler.
 * Reads stdin JSON { teammate_name, team_name }, runs configured quality gates.
 * Exit 0 = allow idle, Exit 2 = block idle with stderr feedback.
 */

try {
  const input = await Bun.stdin.text();
  const data = JSON.parse(input) as { teammate_name: string; team_name: string };

  const config = loadConfig();
  const gateConfig = config?.qualityGates?.teammateIdle;

  if (!gateConfig || gateConfig.commands.length === 0) {
    process.exit(0);
  }

  const result = runQualityGates(gateConfig);

  if (result.passed) {
    process.exit(0);
  }

  const message = formatFailureMessage(result.failures);
  process.stderr.write(
    `[crux-hive] Teammate "${data.teammate_name}" blocked from going idle.\n${message}\n`,
  );
  process.exit(2);
} catch {
  // On unexpected errors, allow idle (graceful fallback)
  process.exit(0);
}
