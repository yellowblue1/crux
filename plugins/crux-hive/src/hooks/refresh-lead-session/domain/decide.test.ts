import { describe, expect, it } from "bun:test";
import { decideRefresh } from "./decide.js";
import type { TeamLeadSummary } from "./types.js";

describe("decideRefresh", () => {
  it("returns noop when current session already leads a team", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-current", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-current", "/project", teams)).toEqual({ kind: "noop" });
  });

  it("returns noop when current session already leads a different team", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-current", leadCwd: "/a" },
      { teamName: "project-b", leadSessionId: "session-other", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-current", "/project", teams)).toEqual({ kind: "noop" });
  });

  it("refreshes when exactly one team's lead cwd matches", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-old", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-new", "/project", teams)).toEqual({
      kind: "refresh",
      teamName: "project-a",
      newLeadSessionId: "session-new",
    });
  });

  it("returns noop when multiple teams have matching lead cwd (ambiguous)", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-x", leadCwd: "/project" },
      { teamName: "project-b", leadSessionId: "session-y", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-new", "/project", teams)).toEqual({ kind: "noop" });
  });

  it("returns noop when no team's lead cwd matches", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-x", leadCwd: "/other" },
    ];
    expect(decideRefresh("session-new", "/project", teams)).toEqual({ kind: "noop" });
  });

  it("returns noop when team list is empty", () => {
    expect(decideRefresh("session-new", "/project", [])).toEqual({ kind: "noop" });
  });

  it("normalizes paths before comparison", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-old", leadCwd: "/project/sub/.." },
    ];
    expect(decideRefresh("session-new", "/project", teams)).toEqual({
      kind: "refresh",
      teamName: "project-a",
      newLeadSessionId: "session-new",
    });
  });
});
