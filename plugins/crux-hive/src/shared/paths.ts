import { homedir } from "node:os";
import { join } from "node:path";

export function getTeamsDir(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".claude", "teams");
}
