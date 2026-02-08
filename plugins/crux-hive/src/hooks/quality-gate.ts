import type { QualityGateConfig } from "./config.js";

export interface GateFailure {
  name: string;
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface GateResult {
  passed: boolean;
  failures: GateFailure[];
}

const DEFAULT_TIMEOUT = 60000;
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Run quality gate commands sequentially.
 * Collects all failures (does not short-circuit) so the agent gets a complete picture.
 */
export function runQualityGates(config: QualityGateConfig): GateResult {
  const failures: GateFailure[] = [];
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  for (const gate of config.commands) {
    const result = Bun.spawnSync(["sh", "-c", gate.command], {
      stdout: "pipe",
      stderr: "pipe",
      timeout,
    });

    if (!result.success) {
      failures.push({
        name: gate.name,
        command: gate.command,
        exitCode: result.exitCode ?? 1,
        stderr: result.stderr.toString().trim(),
        stdout: result.stdout.toString().trim(),
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Format gate failures into a human-readable message for stderr feedback.
 * Truncates to MAX_MESSAGE_LENGTH to avoid overwhelming the agent's context.
 */
export function formatFailureMessage(failures: GateFailure[]): string {
  const lines = ["Quality gate checks failed:"];

  for (const f of failures) {
    lines.push(`\n--- ${f.name} (exit code ${f.exitCode}) ---`);
    if (f.stderr) {
      lines.push(f.stderr);
    } else if (f.stdout) {
      lines.push(f.stdout);
    }
  }

  lines.push("\nPlease fix the issues above before proceeding.");

  const message = lines.join("\n");
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `${message.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
  }
  return message;
}
