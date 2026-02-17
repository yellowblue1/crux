import { exec, execOrThrow, shellEscape } from "../../shared/exec.js";
import type { GitConfigAdapter } from "../domain/ports.js";

export function createGitConfigAdapter(): GitConfigAdapter {
  return {
    getLocal(key: string): string | null {
      const result = exec(`git config --local ${shellEscape(key)}`, { timeout: 1000 });
      return result.success ? result.stdout || null : null;
    },
    setLocal(key: string, value: string): void {
      execOrThrow(`git config --local ${shellEscape(key)} ${shellEscape(value)}`, {
        timeout: 1000,
      });
    },
  };
}
