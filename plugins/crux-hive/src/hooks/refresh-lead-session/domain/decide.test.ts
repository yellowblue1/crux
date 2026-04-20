import { describe, expect, it } from "bun:test";
import { decideRefresh } from "./decide.js";
import type { TeamLeadSummary } from "./types.js";

const noLive: ReadonlySet<string> = new Set();

describe("decideRefresh", () => {
  it("returns noop when current session already leads a team", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-current", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-current", "/project", teams, noLive)).toEqual({ kind: "noop" });
  });

  it("returns noop when current session already leads a different team", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-current", leadCwd: "/a" },
      { teamName: "project-b", leadSessionId: "session-other", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-current", "/project", teams, noLive)).toEqual({ kind: "noop" });
  });

  it("refreshes when exactly one team's lead cwd matches and lead session is dead", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-old", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-new", "/project", teams, noLive)).toEqual({
      kind: "refresh",
      teamName: "project-a",
      staleLeadSessionId: "session-old",
      newLeadSessionId: "session-new",
    });
  });

  it("returns noop when the matching team's lead session is still live", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-live", leadCwd: "/project" },
    ];
    const live = new Set(["session-live"]);
    expect(decideRefresh("session-new", "/project", teams, live)).toEqual({ kind: "noop" });
  });

  it("picks the only dead candidate when live teams share the cwd", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-live", leadCwd: "/project" },
      { teamName: "project-b", leadSessionId: "session-dead", leadCwd: "/project" },
    ];
    const live = new Set(["session-live"]);
    expect(decideRefresh("session-new", "/project", teams, live)).toEqual({
      kind: "refresh",
      teamName: "project-b",
      staleLeadSessionId: "session-dead",
      newLeadSessionId: "session-new",
    });
  });

  it("returns noop when multiple dead teams share the cwd (ambiguous)", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-x", leadCwd: "/project" },
      { teamName: "project-b", leadSessionId: "session-y", leadCwd: "/project" },
    ];
    expect(decideRefresh("session-new", "/project", teams, noLive)).toEqual({ kind: "noop" });
  });

  it("returns noop when no team's lead cwd matches", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-x", leadCwd: "/other" },
    ];
    expect(decideRefresh("session-new", "/project", teams, noLive)).toEqual({ kind: "noop" });
  });

  it("returns noop when team list is empty", () => {
    expect(decideRefresh("session-new", "/project", [], noLive)).toEqual({ kind: "noop" });
  });

  it("normalizes paths before comparison", () => {
    const teams: TeamLeadSummary[] = [
      { teamName: "project-a", leadSessionId: "session-old", leadCwd: "/project/sub/.." },
    ];
    expect(decideRefresh("session-new", "/project", teams, noLive)).toEqual({
      kind: "refresh",
      teamName: "project-a",
      staleLeadSessionId: "session-old",
      newLeadSessionId: "session-new",
    });
  });
});
