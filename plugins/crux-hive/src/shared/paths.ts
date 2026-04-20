import { homedir } from "node:os";
import { join } from "node:path";

function getClaudeDir(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".claude");
}

export function getTeamsDir(): string {
  return join(getClaudeDir(), "teams");
}

export function getSessionsDir(): string {
  return join(getClaudeDir(), "sessions");
}
