import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../../shared/paths.js";
import type { LiveSessionReader } from "../domain/ports.js";

/**
 * Returns true if a signal-0 probe to `pid` succeeds (the process exists) or
 * fails with EPERM (exists but owned by another user). ESRCH (and every
 * other error) means the process is gone — a crashed session may have left
 * its session file behind.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

type LiveSessionReaderDeps = {
  readonly isPidAlive: (pid: number) => boolean;
};

export function createFileLiveSessionReader(
  deps: LiveSessionReaderDeps = { isPidAlive },
): LiveSessionReader {
  async function listLiveSessionIds(): Promise<ReadonlySet<string>> {
    const sessionsDir = getSessionsDir();
    if (!existsSync(sessionsDir)) {
      return new Set();
    }

    let entries: string[];
    try {
      entries = readdirSync(sessionsDir);
    } catch {
      return new Set();
    }

    const jsonEntries = entries.filter((e) => e.endsWith(".json"));
    const payloads = await Promise.all(
      jsonEntries.map(async (name) => {
        try {
          return (await Bun.file(join(sessionsDir, name)).json()) as unknown;
        } catch {
          return null;
        }
      }),
    );

    const ids = new Set<string>();
    for (const payload of payloads) {
      if (!payload || typeof payload !== "object") {
        continue;
      }
      const obj = payload as Record<string, unknown>;
      if (typeof obj.sessionId !== "string" || typeof obj.pid !== "number") {
        continue;
      }
      if (!deps.isPidAlive(obj.pid)) {
        continue;
      }
      ids.add(obj.sessionId);
    }
    return ids;
  }

  return { listLiveSessionIds };
}
