import { describe, expect, it } from "bun:test";
import type { LiveSessionReader, TeamLeadRepository } from "../domain/ports.js";
import type { TeamLeadSummary } from "../domain/types.js";
import { refreshLeadSession } from "./refresh-lead-session.js";

type UpdateCall = { teamName: string; expected: string; next: string };

function createRepo(
  teams: TeamLeadSummary[],
  updateResult: boolean = true,
  onUpdate?: (call: UpdateCall) => void,
): TeamLeadRepository {
  return {
    listTeamLeads: async () => teams,
    updateLeadSessionId: async (teamName, expected, next) => {
      onUpdate?.({ teamName, expected, next });
      return updateResult;
    },
  };
}

function createLive(ids: ReadonlySet<string> = new Set()): LiveSessionReader {
  return { listLiveSessionIds: async () => ids };
}

describe("refreshLeadSession", () => {
  it("returns noop and does not write when session already leads a team", async () => {
    let writeCalls = 0;
    const repo = createRepo(
      [{ teamName: "a", leadSessionId: "s1", leadCwd: "/project" }],
      true,
      () => {
        writeCalls++;
      },
    );

    const result = await refreshLeadSession("s1", "/project", repo, createLive());

    expect(result).toEqual({ kind: "noop" });
    expect(writeCalls).toBe(0);
  });

  it("returns refreshed and issues CAS args when decision is refresh and write succeeds", async () => {
    const calls: UpdateCall[] = [];
    const repo = createRepo(
      [{ teamName: "a", leadSessionId: "old", leadCwd: "/project" }],
      true,
      (call) => {
        calls.push(call);
      },
    );

    const result = await refreshLeadSession("new", "/project", repo, createLive());

    expect(result).toEqual({ kind: "refreshed", teamName: "a" });
    expect(calls).toEqual([{ teamName: "a", expected: "old", next: "new" }]);
  });

  it("returns raced when CAS miss (write skipped)", async () => {
    const repo = createRepo([{ teamName: "a", leadSessionId: "old", leadCwd: "/project" }], false);

    const result = await refreshLeadSession("new", "/project", repo, createLive());

    expect(result).toEqual({ kind: "raced", teamName: "a" });
  });

  it("returns noop when the candidate's leadSessionId is live", async () => {
    let writeCalls = 0;
    const repo = createRepo(
      [{ teamName: "a", leadSessionId: "live", leadCwd: "/project" }],
      true,
      () => {
        writeCalls++;
      },
    );

    const result = await refreshLeadSession("new", "/project", repo, createLive(new Set(["live"])));

    expect(result).toEqual({ kind: "noop" });
    expect(writeCalls).toBe(0);
  });

  it("returns noop when there is no matching team", async () => {
    let writeCalls = 0;
    const repo = createRepo(
      [{ teamName: "a", leadSessionId: "old", leadCwd: "/other" }],
      true,
      () => {
        writeCalls++;
      },
    );

    const result = await refreshLeadSession("new", "/project", repo, createLive());

    expect(result).toEqual({ kind: "noop" });
    expect(writeCalls).toBe(0);
  });
});
