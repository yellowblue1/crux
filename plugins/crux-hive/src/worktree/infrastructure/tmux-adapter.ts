import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  exec as defaultExec,
  type ExecFn,
  execOrThrowAsync as defaultExecOrThrowAsync,
  shellEscape,
} from "../../shared/exec.js";
import type { TmuxAdapter } from "../domain/ports.js";

const TMUX_DETECT_TIMEOUT_MS = 5000;

export type ExecOrThrowAsyncFn = (command: string) => Promise<string>;

export function createTmuxAdapter(
  execFn: ExecFn = defaultExec,
  execAsyncFn: ExecOrThrowAsyncFn = defaultExecOrThrowAsync,
): TmuxAdapter {
  return {
    isAvailable(): boolean {
      return execFn('tmux display-message -p "#S"', { timeout: TMUX_DETECT_TIMEOUT_MS }).success;
    },
    async createWindow(name: string, dir: string, command?: string): Promise<string> {
      const base = `tmux new-window -d -n ${shellEscape(name)} -c ${shellEscape(dir)} -P -F "#{window_id}"`;
      if (!command) {
        return execAsyncFn(base);
      }
      // Write the command to a temp script file to avoid nested quoting issues.
      // The command string contains single quotes from both agent-teams flags
      // (via shellEscape) and base64 prompt decoding (echo '...'). Wrapping
      // the whole thing with shellEscape produces nested single quotes that
      // break shell parsing. Writing to a file sidesteps quoting entirely.
      const scriptDir = mkdtempSync(join(tmpdir(), "crux-hive-"));
      const scriptPath = join(scriptDir, "launch.sh");
      const cleanup = `rm -rf ${shellEscape(scriptDir)}`;
      writeFileSync(scriptPath, `${command}\n${cleanup}\nexec $SHELL -l\n`, { mode: 0o700 });
      const full = `${base} -- "$SHELL" -lic ${shellEscape(`source ${scriptPath}`)}`;
      return execAsyncFn(full);
    },
  };
}
