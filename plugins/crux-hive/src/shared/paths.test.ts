import { describe, expect, it } from "bun:test";
import { getProjectsDir, getSessionsDir, getTeamsDir } from "./paths.js";

describe("paths", () => {
  it("should build the projects dir under .claude", () => {
    expect(getProjectsDir()).toContain("/.claude/projects");
  });

  it("should build the teams and sessions dirs under .claude", () => {
    expect(getTeamsDir()).toContain("/.claude/teams");
    expect(getSessionsDir()).toContain("/.claude/sessions");
  });
});
