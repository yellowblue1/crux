import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TeamConfig } from "../../../team/domain/types.js";
import { createFileTeamLeadRepository } from "./file-team-lead-repository.js";

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

function buildConfig(teamName: string, leadSessionId: string, leadCwd?: string): TeamConfig {
  return {
    name: teamName,
    leadAgentId: `lead@${teamName}`,
    leadSessionId,
    members: [
      {
        agentId: `lead@${teamName}`,
        name: "team-lead",
        agentType: "team-lead",
        ...(leadCwd === undefined ? {} : { cwd: leadCwd }),
      },
    ],
  };
}

describe("createFileTeamLeadRepository", () => {
  describe("listTeamLeads", () => {
    it("returns empty array when teams dir does not exist", async () => {
      rmSync(join(testTeamsDir, "fakehome", ".claude", "teams"), {
        recursive: true,
        force: true,
      });
      const repo = createFileTeamLeadRepository();
      expect(await repo.listTeamLeads()).toEqual([]);
    });

    it("returns empty array when no teams exist", async () => {
      const repo = createFileTeamLeadRepository();
      expect(await repo.listTeamLeads()).toEqual([]);
    });

    it("lists each valid team with its lead cwd", async () => {
      writeTestConfig("team-a", buildConfig("team-a", "session-1", "/project-a"));
      writeTestConfig("team-b", buildConfig("team-b", "session-2", "/project-b"));

      const repo = createFileTeamLeadRepository();
      const summaries = await repo.listTeamLeads();

      expect(summaries).toHaveLength(2);
      expect(summaries).toContainEqual({
        teamName: "team-a",
        leadSessionId: "session-1",
        leadCwd: "/project-a",
      });
      expect(summaries).toContainEqual({
        teamName: "team-b",
        leadSessionId: "session-2",
        leadCwd: "/project-b",
      });
    });

    it("skips teams whose lead member has no cwd", async () => {
      writeTestConfig("team-a", buildConfig("team-a", "session-1"));

      const repo = createFileTeamLeadRepository();
      const summaries = await repo.listTeamLeads();

      expect(summaries).toEqual([]);
    });

    it("skips invalid JSON and invalid schema entries", async () => {
      mkdirSync(getTeamDir("broken"), { recursive: true });
      writeFileSync(join(getTeamDir("broken"), "config.json"), "not json");

      mkdirSync(getTeamDir("incomplete"), { recursive: true });
      writeFileSync(
        join(getTeamDir("incomplete"), "config.json"),
        JSON.stringify({ name: "incomplete" }),
      );

      writeTestConfig("valid", buildConfig("valid", "session-1", "/project"));

      const repo = createFileTeamLeadRepository();
      const summaries = await repo.listTeamLeads();

      expect(summaries).toHaveLength(1);
      expect(summaries[0].teamName).toBe("valid");
    });
  });

  describe("updateLeadSessionId", () => {
    it("writes and returns true when on-disk value matches expected stale id", async () => {
      const config = buildConfig("team-a", "old-session", "/project");
      writeTestConfig("team-a", config);

      const repo = createFileTeamLeadRepository();
      const written = await repo.updateLeadSessionId("team-a", "old-session", "new-session");

      expect(written).toBe(true);
      const updated = JSON.parse(
        readFileSync(join(getTeamDir("team-a"), "config.json"), "utf8"),
      ) as TeamConfig;
      expect(updated.leadSessionId).toBe("new-session");
      expect(updated.name).toBe("team-a");
      expect(updated.members[0].cwd).toBe("/project");
    });

    it("returns false without writing when on-disk value differs (CAS miss)", async () => {
      const config = buildConfig("team-a", "already-fresh", "/project");
      writeTestConfig("team-a", config);
      const before = readFileSync(join(getTeamDir("team-a"), "config.json"), "utf8");

      const repo = createFileTeamLeadRepository();
      const written = await repo.updateLeadSessionId("team-a", "stale-expected", "new-session");

      expect(written).toBe(false);
      const after = readFileSync(join(getTeamDir("team-a"), "config.json"), "utf8");
      expect(after).toBe(before);
    });

    it("throws when another process holds the lock", async () => {
      const config = buildConfig("team-a", "old-session", "/project");
      writeTestConfig("team-a", config);
      writeFileSync(join(getTeamDir("team-a"), "config.json.lock"), "other-pid");

      const repo = createFileTeamLeadRepository();
      await expect(
        repo.updateLeadSessionId("team-a", "old-session", "new-session"),
      ).rejects.toThrow(/Failed to acquire lock/);
    });

    it("releases the lock after writing", async () => {
      const config = buildConfig("team-a", "old-session", "/project");
      writeTestConfig("team-a", config);

      const repo = createFileTeamLeadRepository();
      await repo.updateLeadSessionId("team-a", "old-session", "new-session");

      expect(existsSync(join(getTeamDir("team-a"), "config.json.lock"))).toBe(false);
    });

    it("releases the lock on CAS miss", async () => {
      const config = buildConfig("team-a", "already-fresh", "/project");
      writeTestConfig("team-a", config);

      const repo = createFileTeamLeadRepository();
      await repo.updateLeadSessionId("team-a", "stale-expected", "new-session");

      expect(existsSync(join(getTeamDir("team-a"), "config.json.lock"))).toBe(false);
    });
  });
});
