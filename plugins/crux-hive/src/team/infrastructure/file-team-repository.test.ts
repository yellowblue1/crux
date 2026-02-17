import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TeamConfig } from "../domain/types.js";
import { createFileTeamRepository } from "./file-team-repository.js";

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

describe("readConfig", () => {
  it("should read a valid team config", async () => {
    const repo = createFileTeamRepository();
    const teamName = "test-team";
    const expected = createValidConfig(teamName);
    writeTestConfig(teamName, expected);

    const result = await repo.readConfig(teamName);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(teamName);
    expect(result?.leadSessionId).toBe("session-abc-123-def-456");
    expect(result?.members).toHaveLength(1);
    expect(result?.members[0].name).toBe("team-lead");
  });

  it("should return null for non-existent team", async () => {
    const repo = createFileTeamRepository();
    const result = await repo.readConfig("nonexistent-team");
    expect(result).toBeNull();
  });

  it("should return null for invalid JSON", async () => {
    const repo = createFileTeamRepository();
    const teamDir = getTeamDir("bad-json");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "config.json"), "not valid json{{{");

    const result = await repo.readConfig("bad-json");
    expect(result).toBeNull();
  });

  it("should throw for config missing required fields", async () => {
    const repo = createFileTeamRepository();
    const teamDir = getTeamDir("invalid-config");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "config.json"), JSON.stringify({ name: "test" }));

    expect(repo.readConfig("invalid-config")).rejects.toThrow("Invalid team config format");
  });
});

describe("getLeadSessionId", () => {
  it("should return the lead session ID", async () => {
    const repo = createFileTeamRepository();
    const teamName = "session-test";
    writeTestConfig(teamName, createValidConfig(teamName));

    const sessionId = await repo.getLeadSessionId(teamName);
    expect(sessionId).toBe("session-abc-123-def-456");
  });

  it("should return null for non-existent team", async () => {
    const repo = createFileTeamRepository();
    const sessionId = await repo.getLeadSessionId("nonexistent");
    expect(sessionId).toBeNull();
  });
});

describe("registerMember", () => {
  it("should add a new member to the team config", async () => {
    const repo = createFileTeamRepository();
    const teamName = "register-test";
    writeTestConfig(teamName, createValidConfig(teamName));

    await repo.registerMember(teamName, {
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      model: "haiku",
      color: "blue",
      isActive: true,
    });

    const config = await repo.readConfig(teamName);
    expect(config?.members).toHaveLength(2);
    expect(config?.members[1].name).toBe("worker-a");
    expect(config?.members[1].color).toBe("blue");
  });

  it("should update an existing member", async () => {
    const repo = createFileTeamRepository();
    const teamName = "update-test";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: false,
    });
    writeTestConfig(teamName, config);

    await repo.registerMember(teamName, {
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: true,
      color: "green",
    });

    const updated = await repo.readConfig(teamName);
    expect(updated?.members).toHaveLength(2);
    expect(updated?.members[1].isActive).toBe(true);
    expect(updated?.members[1].color).toBe("green");
  });

  it("should throw for non-existent team", async () => {
    const repo = createFileTeamRepository();
    expect(
      repo.registerMember("nonexistent", {
        agentId: "worker@nonexistent",
        name: "worker",
        agentType: "Bash",
      }),
    ).rejects.toThrow("Team 'nonexistent' not found");
  });

  it("should clean up lock file after success", async () => {
    const repo = createFileTeamRepository();
    const teamName = "lock-cleanup";
    writeTestConfig(teamName, createValidConfig(teamName));

    await repo.registerMember(teamName, {
      agentId: `worker@${teamName}`,
      name: "worker",
      agentType: "Bash",
    });

    const lockPath = join(getTeamDir(teamName), "config.json.lock");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("should clean up lock file after failure", async () => {
    const repo = createFileTeamRepository();
    const teamName = "lock-failure";
    // Don't create the config file — registerMember should fail
    const teamDir = getTeamDir(teamName);
    mkdirSync(teamDir, { recursive: true });

    try {
      await repo.registerMember(teamName, {
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
  it("should create an inbox file for a teammate", async () => {
    const repo = createFileTeamRepository();
    const teamName = "inbox-test";
    const teamDir = getTeamDir(teamName);
    mkdirSync(teamDir, { recursive: true });

    await repo.createInbox(teamName, "worker-a");

    const inboxPath = join(teamDir, "inboxes", "worker-a.json");
    expect(existsSync(inboxPath)).toBe(true);
    expect(readFileSync(inboxPath, "utf-8")).toBe("[]");
  });

  it("should not overwrite existing inbox", async () => {
    const repo = createFileTeamRepository();
    const teamName = "inbox-existing";
    const teamDir = getTeamDir(teamName);
    const inboxDir = join(teamDir, "inboxes");
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, "worker-a.json"), '[{"msg":"existing"}]');

    await repo.createInbox(teamName, "worker-a");

    const content = readFileSync(join(inboxDir, "worker-a.json"), "utf-8");
    expect(content).toBe('[{"msg":"existing"}]');
  });

  it("should create inboxes directory if it does not exist", async () => {
    const repo = createFileTeamRepository();
    const teamName = "inbox-mkdir";
    const teamDir = getTeamDir(teamName);
    mkdirSync(teamDir, { recursive: true });

    await repo.createInbox(teamName, "worker-b");

    expect(existsSync(join(teamDir, "inboxes"))).toBe(true);
  });
});

describe("deregisterMember", () => {
  it("should remove a member from the team config", async () => {
    const repo = createFileTeamRepository();
    const teamName = "deregister-test";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: true,
    });
    writeTestConfig(teamName, config);

    const result = await repo.deregisterMember(teamName, "worker-a");

    expect(result).toBe(true);
    const updated = await repo.readConfig(teamName);
    expect(updated?.members).toHaveLength(1);
    expect(updated?.members[0].name).toBe("team-lead");
  });

  it("should return false for non-existent team", async () => {
    const repo = createFileTeamRepository();
    const result = await repo.deregisterMember("nonexistent", "worker-a");
    expect(result).toBe(false);
  });

  it("should return false for non-existent member", async () => {
    const repo = createFileTeamRepository();
    const teamName = "deregister-missing";
    writeTestConfig(teamName, createValidConfig(teamName));

    const result = await repo.deregisterMember(teamName, "no-such-worker");
    expect(result).toBe(false);
  });

  it("should be idempotent — second call returns false", async () => {
    const repo = createFileTeamRepository();
    const teamName = "deregister-idempotent";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: true,
    });
    writeTestConfig(teamName, config);

    expect(await repo.deregisterMember(teamName, "worker-a")).toBe(true);
    expect(await repo.deregisterMember(teamName, "worker-a")).toBe(false);
  });

  it("should clean up lock file after success", async () => {
    const repo = createFileTeamRepository();
    const teamName = "deregister-lock";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
    });
    writeTestConfig(teamName, config);

    await repo.deregisterMember(teamName, "worker-a");

    const lockPath = join(getTeamDir(teamName), "config.json.lock");
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("removeInbox", () => {
  it("should remove an existing inbox file", async () => {
    const repo = createFileTeamRepository();
    const teamName = "remove-inbox-test";
    const teamDir = getTeamDir(teamName);
    const inboxDir = join(teamDir, "inboxes");
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, "worker-a.json"), "[]");

    const result = await repo.removeInbox(teamName, "worker-a");

    expect(result).toBe(true);
    expect(existsSync(join(inboxDir, "worker-a.json"))).toBe(false);
  });

  it("should return false for non-existent inbox", async () => {
    const repo = createFileTeamRepository();
    const result = await repo.removeInbox("nonexistent-team", "worker-a");
    expect(result).toBe(false);
  });

  it("should be idempotent — second call returns false", async () => {
    const repo = createFileTeamRepository();
    const teamName = "remove-inbox-idempotent";
    const teamDir = getTeamDir(teamName);
    const inboxDir = join(teamDir, "inboxes");
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, "worker-a.json"), "[]");

    expect(await repo.removeInbox(teamName, "worker-a")).toBe(true);
    expect(await repo.removeInbox(teamName, "worker-a")).toBe(false);
  });
});

describe("findWorkerByWorktreePath", () => {
  it("should find a worker by worktree path", async () => {
    const repo = createFileTeamRepository();
    const teamName = "find-worker-test";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-a@${teamName}`,
      name: "worker-a",
      agentType: "Bash",
      isActive: true,
      cwd: "/worktrees/feat-branch",
    });
    writeTestConfig(teamName, config);

    const result = await repo.findWorkerByWorktreePath("/worktrees/feat-branch");
    expect(result).not.toBeNull();
    expect(result?.teamName).toBe(teamName);
    expect(result?.agentName).toBe("worker-a");
  });

  it("should return null when no worker matches", async () => {
    const repo = createFileTeamRepository();
    const teamName = "find-no-match";
    writeTestConfig(teamName, createValidConfig(teamName));

    const result = await repo.findWorkerByWorktreePath("/nonexistent/path");
    expect(result).toBeNull();
  });

  it("should return null when teams directory does not exist", async () => {
    const repo = createFileTeamRepository();
    rmSync(join(testTeamsDir, "fakehome", ".claude", "teams"), {
      recursive: true,
      force: true,
    });

    const result = await repo.findWorkerByWorktreePath("/some/path");
    expect(result).toBeNull();
  });

  it("should normalize paths for comparison", async () => {
    const repo = createFileTeamRepository();
    const teamName = "normalize-test";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-b@${teamName}`,
      name: "worker-b",
      agentType: "Bash",
      cwd: "/worktrees/feat-branch/",
    });
    writeTestConfig(teamName, config);

    const result = await repo.findWorkerByWorktreePath("/worktrees/feat-branch");
    expect(result).not.toBeNull();
    expect(result?.agentName).toBe("worker-b");
  });

  it("should search across multiple teams", async () => {
    const repo = createFileTeamRepository();
    const team1 = "multi-team-1";
    const team2 = "multi-team-2";
    writeTestConfig(team1, createValidConfig(team1));

    const config2 = createValidConfig(team2);
    config2.members.push({
      agentId: `worker-x@${team2}`,
      name: "worker-x",
      agentType: "Bash",
      cwd: "/worktrees/fix-bug",
    });
    writeTestConfig(team2, config2);

    const result = await repo.findWorkerByWorktreePath("/worktrees/fix-bug");
    expect(result).not.toBeNull();
    expect(result?.teamName).toBe(team2);
    expect(result?.agentName).toBe("worker-x");
  });

  it("should skip members without cwd", async () => {
    const repo = createFileTeamRepository();
    const teamName = "no-cwd-test";
    const config = createValidConfig(teamName);
    config.members.push({
      agentId: `worker-no-cwd@${teamName}`,
      name: "worker-no-cwd",
      agentType: "Bash",
      isActive: true,
    });
    writeTestConfig(teamName, config);

    const result = await repo.findWorkerByWorktreePath("/unrelated/path");
    expect(result).toBeNull();
  });
});
