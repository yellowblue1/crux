import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../../shared/paths.js";
import type { LiveSessionReader } from "../domain/ports.js";

export function createFileLiveSessionReader(): LiveSessionReader {
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
      if (payload && typeof payload === "object") {
        const sessionId = (payload as Record<string, unknown>).sessionId;
        if (typeof sessionId === "string") {
          ids.add(sessionId);
        }
      }
    }
    return ids;
  }

  return { listLiveSessionIds };
}
