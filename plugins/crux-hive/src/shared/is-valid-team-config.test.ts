import { describe, expect, it } from "bun:test";
import { isValidTeamConfig, isValidTeamMember } from "./is-valid-team-config.js";

describe("isValidTeamMember", () => {
  it("accepts a minimal valid member", () => {
    expect(isValidTeamMember({ agentId: "a@t", name: "a", agentType: "worker" })).toBe(true);
  });

  it("accepts a member with all optional fields", () => {
    expect(
      isValidTeamMember({
        agentId: "a@t",
        name: "a",
        agentType: "worker",
        model: "sonnet",
        color: "blue",
        tmuxPaneId: "%1",
        backendType: "tmux",
        isActive: true,
        cwd: "/proj",
      }),
    ).toBe(true);
  });

  it("rejects a member missing agentId", () => {
    expect(isValidTeamMember({ name: "a", agentType: "worker" })).toBe(false);
  });

  it("rejects a member with wrong-typed optional fields", () => {
    expect(
      isValidTeamMember({
        agentId: "a@t",
        name: "a",
        agentType: "worker",
        cwd: 123,
      }),
    ).toBe(false);

    expect(
      isValidTeamMember({
        agentId: "a@t",
        name: "a",
        agentType: "worker",
        isActive: "yes",
      }),
    ).toBe(false);
  });

  it("rejects non-object inputs", () => {
    expect(isValidTeamMember(null)).toBe(false);
    expect(isValidTeamMember("string")).toBe(false);
    expect(isValidTeamMember(42)).toBe(false);
  });
});

describe("isValidTeamConfig", () => {
  it("accepts a well-formed config", () => {
    expect(
      isValidTeamConfig({
        name: "t",
        leadAgentId: "lead@t",
        leadSessionId: "sid",
        members: [{ agentId: "lead@t", name: "lead", agentType: "team-lead" }],
      }),
    ).toBe(true);
  });

  it("accepts a config with an empty members array", () => {
    expect(
      isValidTeamConfig({
        name: "t",
        leadAgentId: "lead@t",
        leadSessionId: "sid",
        members: [],
      }),
    ).toBe(true);
  });

  it("rejects when any member fails the shape check", () => {
    expect(
      isValidTeamConfig({
        name: "t",
        leadAgentId: "lead@t",
        leadSessionId: "sid",
        members: [{ agentId: "lead@t", name: "lead", agentType: "team-lead" }, { name: "broken" }],
      }),
    ).toBe(false);
  });

  it("rejects when top-level fields are missing or wrongly typed", () => {
    expect(isValidTeamConfig({})).toBe(false);
    expect(isValidTeamConfig({ name: "t", leadAgentId: "x", leadSessionId: 1, members: [] })).toBe(
      false,
    );
    expect(
      isValidTeamConfig({ name: "t", leadAgentId: "x", leadSessionId: "s", members: "no" }),
    ).toBe(false);
  });

  it("rejects null and non-objects", () => {
    expect(isValidTeamConfig(null)).toBe(false);
    expect(isValidTeamConfig("str")).toBe(false);
  });
});
