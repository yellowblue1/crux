import { describe, expect, it } from "bun:test";
import type { TeamLeadRepository } from "../domain/ports.js";
import type { TeamLeadSummary } from "../domain/types.js";
import { refreshLeadSession } from "./refresh-lead-session.js";

function createRepo(
  teams: TeamLeadSummary[],
  onUpdate?: (teamName: string, sessionId: string) => void,
): TeamLeadRepository {
  return {
    listTeamLeads: async () => teams,
    updateLeadSessionId: async (teamName, sessionId) => {
      onUpdate?.(teamName, sessionId);
    },
  };
}

describe("refreshLeadSession", () => {
  it("returns noop and does not write when session already leads a team", async () => {
    let writeCalls = 0;
    const repo = createRepo([{ teamName: "a", leadSessionId: "s1", leadCwd: "/project" }], () => {
      writeCalls++;
    });

    const result = await refreshLeadSession("s1", "/project", repo);

    expect(result).toEqual({ kind: "noop" });
    expect(writeCalls).toBe(0);
  });

  it("refreshes when exactly one team's lead cwd matches", async () => {
    const updates: Array<[string, string]> = [];
    const repo = createRepo(
      [{ teamName: "a", leadSessionId: "old", leadCwd: "/project" }],
      (teamName, sessionId) => {
        updates.push([teamName, sessionId]);
      },
    );

    const result = await refreshLeadSession("new", "/project", repo);

    expect(result).toEqual({ kind: "refresh", teamName: "a", newLeadSessionId: "new" });
    expect(updates).toEqual([["a", "new"]]);
  });

  it("returns noop when there is no matching team", async () => {
    let writeCalls = 0;
    const repo = createRepo([{ teamName: "a", leadSessionId: "old", leadCwd: "/other" }], () => {
      writeCalls++;
    });

    const result = await refreshLeadSession("new", "/project", repo);

    expect(result).toEqual({ kind: "noop" });
    expect(writeCalls).toBe(0);
  });
});
