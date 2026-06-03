import { describe, expect, it } from "bun:test";
import { buildResumeCommand } from "./resume-command.js";

describe("buildResumeCommand", () => {
  it("should build a resume command with --resume and team flags", () => {
    const cmd = buildResumeCommand({
      sessionId: "11111111-2222-3333-4444-555555555555",
      agentTeamsFlags: "--team-name 'my-team' --agent-name 'worker'",
    });
    expect(cmd).toContain("claude");
    expect(cmd).toContain("--resume '11111111-2222-3333-4444-555555555555'");
    expect(cmd).toContain("--team-name 'my-team'");
  });

  it("should include --plugin-dir when provided", () => {
    const cmd = buildResumeCommand({
      sessionId: "abc",
      agentTeamsFlags: "",
      pluginDir: "/path/to/plugin",
    });
    expect(cmd).toContain("--plugin-dir '/path/to/plugin'");
  });

  it("should omit --plugin-dir when not provided", () => {
    const cmd = buildResumeCommand({ sessionId: "abc", agentTeamsFlags: "" });
    expect(cmd).not.toContain("--plugin-dir");
  });
});
