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

export type ExecFn = (command: string, options?: { timeout?: number }) => ExecResult;

/**
 * Execute a command and return the result.
 * Uses Bun.spawnSync for better structured output.
 */
export function exec(command: string, options?: { timeout?: number }): ExecResult {
  try {
    const result = Bun.spawnSync(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: options?.timeout ?? 60000,
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

/**
 * Execute a command asynchronously without blocking the event loop.
 * Uses Bun.spawn with Promise.race for timeout protection.
 */
export async function execAsync(
  command: string,
  options?: { timeout?: number },
): Promise<ExecResult> {
  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutMs = options?.timeout ?? 60000;
    let timer: ReturnType<typeof setTimeout>;
    const exitCode = await Promise.race([
      proc.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          proc.kill();
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    if (exitCode === 0) {
      return { success: true, stdout: stdout.trim() };
    }
    return { success: false, stdout: "", error: stderr.trim() || `Exit code: ${exitCode}` };
  } catch (e) {
    const error = e as Error;
    return { success: false, stdout: "", error: error.message };
  }
}

/**
 * Execute a command asynchronously and throw on failure
 */
export async function execOrThrowAsync(
  command: string,
  options?: { timeout?: number },
): Promise<string> {
  const result = await execAsync(command, options);
  if (!result.success) {
    throw new Error(result.error || `Command failed: ${command}`);
  }
  return result.stdout;
}
