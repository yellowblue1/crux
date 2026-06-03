import { describe, expect, it } from "bun:test";
import { buildAgentTeamsFlags } from "./agent-teams-flags.js";

describe("buildAgentTeamsFlags", () => {
  const base = {
    teamName: "my-team",
    agentName: "worker",
    leadSessionId: "lead-session-id",
  };

  it("should build the core agent teams flags", () => {
    const flags = buildAgentTeamsFlags(base);
    expect(flags).toContain("--agent-id 'worker@my-team'");
    expect(flags).toContain("--agent-name 'worker'");
    expect(flags).toContain("--team-name 'my-team'");
    expect(flags).toContain("--parent-session-id 'lead-session-id'");
    expect(flags).toContain("--agent-type Bash");
  });

  it("should not emit --session-id (a generic flag, not a team flag)", () => {
    const flags = buildAgentTeamsFlags(base);
    expect(flags).not.toContain("--session-id");
  });

  it("should include optional color, model, and plan mode flags", () => {
    const flags = buildAgentTeamsFlags({
      ...base,
      agentColor: "green",
      model: "sonnet",
      planMode: true,
    });
    expect(flags).toContain("--agent-color 'green'");
    expect(flags).toContain("--model 'sonnet'");
    expect(flags).toContain("--plan-mode-required");
  });
});
