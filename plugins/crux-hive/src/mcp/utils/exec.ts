/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 */
export function shellEscape(str: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export interface ExecResult {
  success: boolean;
  stdout: string;
  error?: string;
}

/**
 * Execute a command and return the result.
 * Uses Bun.spawnSync for better structured output.
 */
export function exec(command: string, options?: { timeout?: number }): ExecResult {
  try {
    const result = Bun.spawnSync(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: options?.timeout ?? 30000,
    });

    const stdout = result.stdout.toString().trim();
    const stderr = result.stderr.toString().trim();

    if (result.success) {
      return { success: true, stdout };
    }
    return { success: false, stdout: "", error: stderr || `Exit code: ${result.exitCode}` };
  } catch (e) {
    const error = e as Error;
    return { success: false, stdout: "", error: error.message };
  }
}

/**
 * Execute a command and throw on failure
 */
export function execOrThrow(command: string, options?: { timeout?: number }): string {
  const result = exec(command, options);
  if (!result.success) {
    throw new Error(result.error || `Command failed: ${command}`);
  }
  return result.stdout;
}
