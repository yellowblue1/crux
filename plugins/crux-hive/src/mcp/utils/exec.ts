import { execSync } from "node:child_process";

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
 * Execute a command and return the result
 */
export function exec(command: string, options?: { timeout?: number }): ExecResult {
  try {
    const stdout = execSync(command, {
      encoding: "utf-8",
      timeout: options?.timeout ?? 30000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return { success: true, stdout };
  } catch (e) {
    const error = e as Error & { stderr?: Buffer | string };
    const stderr = error.stderr
      ? typeof error.stderr === "string"
        ? error.stderr
        : error.stderr.toString()
      : error.message;
    return { success: false, stdout: "", error: stderr.trim() };
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
