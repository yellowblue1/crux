import { execOrThrowAsync, shellEscape } from "../../shared/exec.js";
import type { TmuxAdapter } from "../domain/ports.js";

export function createTmuxAdapter(): TmuxAdapter {
  return {
    isAvailable(): boolean {
      return !!process.env.TMUX;
    },
    async createWindow(name: string, dir: string, command?: string): Promise<string> {
      const base = `tmux new-window -d -n ${shellEscape(name)} -c ${shellEscape(dir)} -P -F "#{window_id}"`;
      // When command is provided, launch via login shell to ensure full
      // initialization (.zshrc/.bashrc/starship/oh-my-zsh) before command runs.
      // After command exits, drop into a new login shell so the window stays open.
      const full = command
        ? `${base} -- "$SHELL" -lic ${shellEscape(`${command}; exec $SHELL -l`)}`
        : base;
      return execOrThrowAsync(full);
    },
  };
}
