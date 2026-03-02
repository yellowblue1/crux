import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TeamConfig } from "../../../team/domain/types.js";
import { createFileTeamReader } from "./file-team-reader.js";

const testTeamsDir = join(import.meta.dir, "__test_teams__");
const originalHomedir = process.env.HOME;

beforeEach(() => {
  process.env.HOME = join(testTeamsDir, "fakehome");
  mkdirSync(join(testTeamsDir, "fakehome", ".claude", "teams"), { recursive: true });
});

afterEach(() => {
  process.env.HOME = originalHomedir;
  if (existsSync(testTeamsDir)) {
    rmSync(testTeamsDir, { recursive: true, force: true });
  }
});

function getTeamDir(teamName: string): string {
  return join(testTeamsDir, "fakehome", ".claude", "teams", teamName);
}

function writeTestConfig(teamName: string, config: TeamConfig): void {
  const teamDir = getTeamDir(teamName);
  mkdirSync(teamDir, { recursive: true });
  writeFileSync(join(teamDir, "config.json"), JSON.stringify(config, null, 2));
}

function createValidConfig(teamName: string, sessionId: string): TeamConfig {
  return {
    name: teamName,
    leadAgentId: `lead@${teamName}`,
    leadSessionId: sessionId,
    members: [
      {
        agentId: `lead@${teamName}`,
        name: "team-lead",
        agentType: "team-lead",
        model: "claude-opus-4-6",
        cwd: "/project",
      },
      {
        agentId: `worker-a@${teamName}`,
        name: "worker-a",
        agentType: "Bash",
        isActive: true,
        cwd: "/worktrees/feat-a",
      },
      {
        agentId: `worker-b@${teamName}`,
        name: "worker-b",
        agentType: "Bash",
        isActive: false,
      },
    ],
  };
}

describe("findOrchestratorTeam", () => {
  it("should return state when session matches leadSessionId", async () => {
    const reader = createFileTeamReader();
    const sessionId = "session-123";
    writeTestConfig("my-project", createValidConfig("my-project", sessionId));

    const result = await reader.findOrchestratorTeam(sessionId);

    expect(result).not.toBeNull();
    expect(result?.teamName).toBe("my-project");
    expect(result?.workers).toHaveLength(2);
    expect(result?.workers[0]).toEqual({
      name: "worker-a",
      isActive: true,
    });
    expect(result?.workers[1]).toEqual({
      name: "worker-b",
      isActive: false,
    });
  });

  it("should exclude the team lead from workers", async () => {
    const reader = createFileTeamReader();
    const sessionId = "session-456";
    writeTestConfig("lead-test", createValidConfig("lead-test", sessionId));

    const result = await reader.findOrchestratorTeam(sessionId);

    expect(result).not.toBeNull();
    const workerNames = result?.workers.map((w) => w.name);
    expect(workerNames).not.toContain("team-lead");
  });

  it("should return null when no teams exist", async () => {
    const reader = createFileTeamReader();
    const result = await reader.findOrchestratorTeam("session-xyz");
    expect(result).toBeNull();
  });

  it("should return null when session does not match any team", async () => {
    const reader = createFileTeamReader();
    writeTestConfig("other-project", createValidConfig("other-project", "other-session"));

    const result = await reader.findOrchestratorTeam("unrelated-session");
    expect(result).toBeNull();
  });

  it("should return null for corrupted config JSON", async () => {
    const reader = createFileTeamReader();
    const teamDir = getTeamDir("bad-json");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "config.json"), "not valid json{{{");

    const result = await reader.findOrchestratorTeam("session-abc");
    expect(result).toBeNull();
  });

  it("should skip configs with missing required fields", async () => {
    const reader = createFileTeamReader();
    const teamDir = getTeamDir("incomplete");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, "config.json"),
      JSON.stringify({ leadSessionId: "session-incomplete" }),
    );

    const result = await reader.findOrchestratorTeam("session-incomplete");
    expect(result).toBeNull();
  });

  it("should return null when teams directory does not exist", async () => {
    const reader = createFileTeamReader();
    rmSync(join(testTeamsDir, "fakehome", ".claude", "teams"), {
      recursive: true,
      force: true,
    });

    const result = await reader.findOrchestratorTeam("session-abc");
    expect(result).toBeNull();
  });

  it("should search across multiple teams", async () => {
    const reader = createFileTeamReader();
    writeTestConfig("project-a", createValidConfig("project-a", "session-a"));
    writeTestConfig("project-b", createValidConfig("project-b", "session-b"));

    const result = await reader.findOrchestratorTeam("session-b");
    expect(result).not.toBeNull();
    expect(result?.teamName).toBe("project-b");
  });

  it("should default isActive to false when not set", async () => {
    const reader = createFileTeamReader();
    const config: TeamConfig = {
      name: "default-test",
      leadAgentId: "lead@default-test",
      leadSessionId: "session-default",
      members: [
        { agentId: "lead@default-test", name: "team-lead", agentType: "team-lead" },
        { agentId: "worker@default-test", name: "worker-x", agentType: "Bash" },
      ],
    };
    writeTestConfig("default-test", config);

    const result = await reader.findOrchestratorTeam("session-default");
    expect(result?.workers[0].isActive).toBe(false);
  });
});
