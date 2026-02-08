import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TeamConfig } from "./agent-teams.js";
import {
  createInbox,
  deregisterTeamMember,
  getLeadSessionId,
  readTeamConfig,
  registerTeamMember,
  removeInbox,
} from "./agent-teams.js";

// Use a temp directory to avoid modifying the real ~/.claude/teams
const testTeamsDir = join(import.meta.dir, "__test_teams__");

// Mock homedir to use test directory
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

function createValidConfig(teamName: string): TeamConfig {
  return {
    name: teamName,
    leadAgentId: `team-lead@${teamName}`,
    leadSessionId: "session-abc-123-def-456",
    members: [
      {
        agentId: `team-lead@${teamName}`,
        name: "team-lead",
        agentType: "team-lead",
        model: "claude-opus-4-6",
        cwd: "/path/to/project",
      },
    ],
  };
}

describe("readTeamConfig", () => {
  it("should read a valid team config", () => {
    const teamName = "test-team";
    const expected = createValidConfig(teamName);
    writeTestConfig(teamName, expected);

    const result = readTeamConfig(teamName);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(teamName);
    expect(result?.leadSessionId).toBe("session-abc-123-def-456");
    expect(result?.members).toHaveLength(1);
    expect(result?.members[0].name).toBe("team-lead");
  });

  it("should return null for non-existent team", () => {
    const result = readTeamConfig("nonexistent-team");
    expect(result).toBeNull();
  });

  it("should return null for invalid JSON", () => {
    const teamDir = getTeamDir("bad-json");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "config.json"), "not valid json{{{");

    const result = readTeamConfig("bad-json");
    expect(result).toBeNull();
  });

  it("should throw for config missing required fields", () => {
    const teamDir = getTeamDir("invalid-config");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "config.json"), JSON.stringify({ name: "test" }));

    expect(() => readTeamConfig("invalid-config")).toThrow("Invalid team config format");
  });
});

describe("getLeadSessionId", () => {
  it("should return the lead session ID", () => {
    const teamName = "session-test";
    writeTestConfig(teamName, createValidConfig(teamName));

    const sessionId = getLeadSessionId(teamName);
    expect(sessionId).toBe("session-abc-123-def-456");
  });

  it("should return null for non-existent team", () => {
    const sessionId = getLeadSessionId("nonexistent");
    expect(sessionId).toBeNull();
  });
});

describe("registerTeamMember", () => {
  it("should add a new member to the team config", () => {
    const teamName = "register-test";
    writeTestConfig(teamName, createValidConfig(teamName));

    registerTeamMember(teamName, {
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      model: "haiku",
      color: "blue",
      isActive: true,
    });

    const config = readTeamConfig(teamName);
    expect(config?.members).toHaveLength(2);
    expect(config?.members[1].name).toBe("worker-a");
    expect(config?.members[1].color).toBe("blue");
  });

  it("should update an existing member", () => {
    const teamName = "update-test";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: false,
    });
    writeTestConfig(teamName, config);

    registerTeamMember(teamName, {
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: true,
      color: "green",
    });

    const updated = readTeamConfig(teamName);
    expect(updated?.members).toHaveLength(2);
    expect(updated?.members[1].isActive).toBe(true);
    expect(updated?.members[1].color).toBe("green");
  });

  it("should throw for non-existent team", () => {
    expect(() =>
      registerTeamMember("nonexistent", {
        agentId: "worker@nonexistent",
        name: "worker",
        agentType: "Bash",
      }),
    ).toThrow("Team 'nonexistent' not found");
  });

  it("should clean up lock file after success", () => {
    const teamName = "lock-cleanup";
    writeTestConfig(teamName, createValidConfig(teamName));

    registerTeamMember(teamName, {
      agentId: `worker@${teamName}`,
      name: "worker",
      agentType: "Bash",
    });

    const lockPath = join(getTeamDir(teamName), "config.json.lock");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("should clean up lock file after failure", () => {
    const teamName = "lock-failure";
    // Don't create the config file — registerTeamMember should fail
    const teamDir = getTeamDir(teamName);
    mkdirSync(teamDir, { recursive: true });

    try {
      registerTeamMember(teamName, {
        agentId: `worker@${teamName}`,
        name: "worker",
        agentType: "Bash",
      });
    } catch {
      // Expected
    }

    const lockPath = join(teamDir, "config.json.lock");
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("createInbox", () => {
  it("should create an inbox file for a teammate", () => {
    const teamName = "inbox-test";
    const teamDir = getTeamDir(teamName);
    mkdirSync(teamDir, { recursive: true });

    createInbox(teamName, "worker-a");

    const inboxPath = join(teamDir, "inboxes", "worker-a.json");
    expect(existsSync(inboxPath)).toBe(true);
    expect(readFileSync(inboxPath, "utf-8")).toBe("[]");
  });

  it("should not overwrite existing inbox", () => {
    const teamName = "inbox-existing";
    const teamDir = getTeamDir(teamName);
    const inboxDir = join(teamDir, "inboxes");
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, "worker-a.json"), '[{"msg":"existing"}]');

    createInbox(teamName, "worker-a");

    const content = readFileSync(join(inboxDir, "worker-a.json"), "utf-8");
    expect(content).toBe('[{"msg":"existing"}]');
  });

  it("should create inboxes directory if it does not exist", () => {
    const teamName = "inbox-mkdir";
    const teamDir = getTeamDir(teamName);
    mkdirSync(teamDir, { recursive: true });

    createInbox(teamName, "worker-b");

    expect(existsSync(join(teamDir, "inboxes"))).toBe(true);
  });
});

describe("deregisterTeamMember", () => {
  it("should remove a member from the team config", () => {
    const teamName = "deregister-test";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: true,
    });
    writeTestConfig(teamName, config);

    const result = deregisterTeamMember(teamName, "worker-a");

    expect(result).toBe(true);
    const updated = readTeamConfig(teamName);
    expect(updated?.members).toHaveLength(1);
    expect(updated?.members[0].name).toBe("team-lead");
  });

  it("should return false for non-existent team", () => {
    const result = deregisterTeamMember("nonexistent", "worker-a");
    expect(result).toBe(false);
  });

  it("should return false for non-existent member", () => {
    const teamName = "deregister-missing";
    writeTestConfig(teamName, createValidConfig(teamName));

    const result = deregisterTeamMember(teamName, "no-such-worker");
    expect(result).toBe(false);
  });

  it("should be idempotent — second call returns false", () => {
    const teamName = "deregister-idempotent";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: true,
    });
    writeTestConfig(teamName, config);

    expect(deregisterTeamMember(teamName, "worker-a")).toBe(true);
    expect(deregisterTeamMember(teamName, "worker-a")).toBe(false);
  });

  it("should clean up lock file after success", () => {
    const teamName = "deregister-lock";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
    });
    writeTestConfig(teamName, config);

    deregisterTeamMember(teamName, "worker-a");

    const lockPath = join(getTeamDir(teamName), "config.json.lock");
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("removeInbox", () => {
  it("should remove an existing inbox file", () => {
    const teamName = "remove-inbox-test";
    const teamDir = getTeamDir(teamName);
    const inboxDir = join(teamDir, "inboxes");
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, "worker-a.json"), "[]");

    const result = removeInbox(teamName, "worker-a");

    expect(result).toBe(true);
    expect(existsSync(join(inboxDir, "worker-a.json"))).toBe(false);
  });

  it("should return false for non-existent inbox", () => {
    const result = removeInbox("nonexistent-team", "worker-a");
    expect(result).toBe(false);
  });

  it("should be idempotent — second call returns false", () => {
    const teamName = "remove-inbox-idempotent";
    const teamDir = getTeamDir(teamName);
    const inboxDir = join(teamDir, "inboxes");
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, "worker-a.json"), "[]");

    expect(removeInbox(teamName, "worker-a")).toBe(true);
    expect(removeInbox(teamName, "worker-a")).toBe(false);
  });
});
