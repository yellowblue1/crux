#!/usr/bin/env bun

import { loadConfig } from "./config.js";
import { formatFailureMessage, runQualityGates } from "./quality-gate.js";

/**
 * TaskCompleted hook handler.
 * Reads stdin JSON { task_id, task_subject, task_description, teammate_name, team_name },
 * runs configured quality gates.
 * Exit 0 = allow completion, Exit 2 = block completion with stderr feedback.
 */

interface TaskCompletedInput {
  task_id: string;
  task_subject: string;
  task_description: string;
  teammate_name: string;
  team_name: string;
}

try {
  const input = await Bun.stdin.text();
  const data = JSON.parse(input) as TaskCompletedInput;

  const config = loadConfig();
  const gateConfig = config?.qualityGates?.taskCompleted;

  if (!gateConfig || gateConfig.commands.length === 0) {
    process.exit(0);
  }

  const result = runQualityGates(gateConfig);

  if (result.passed) {
    process.exit(0);
  }

  const message = formatFailureMessage(result.failures);
  process.stderr.write(
    `[crux-hive] Task "${data.task_subject}" (${data.task_id}) blocked from completion.\n${message}\n`,
  );
  process.exit(2);
} catch {
  // On unexpected errors, allow completion (graceful fallback)
  process.exit(0);
}
