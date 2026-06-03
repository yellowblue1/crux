import { describe, expect, it } from "bun:test";
import type { TeamRepository } from "../../team/domain/ports.js";
import type { TeamConfig, TeamMember } from "../../team/domain/types.js";
import type { TmuxAdapter } from "../domain/ports.js";
import { type ResumeTeamDeps, type ResumeTeamResult, resumeTeam } from "./resume-team.js";

function leadMember(): TeamMember {
  return { agentId: "team-lead@my-team", name: "team-lead", agentType: "team-lead" };
}

function worker(overrides?: Partial<TeamMember>): TeamMember {
  return {
    agentId: "worker-a@my-team",
    name: "worker-a",
    agentType: "Bash",
    cwd: "/worktrees/worker-a",
    sessionId: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

function config(members: TeamMember[]): TeamConfig {
  return {
    name: "my-team",
    leadAgentId: "team-lead@my-team",
    leadSessionId: "lead-session",
    members,
  };
}

function createMockTmux(overrides?: Partial<TmuxAdapter>): TmuxAdapter {
  return {
    isAvailable: () => true,
    createWindow: async () => "@1",
    listPanePaths: async () => new Set(),
    ...overrides,
  };
}

function createMockTeamRepo(cfg: TeamConfig | null): TeamRepository {
  return {
    readConfig: async () => cfg,
    getLeadSessionId: async () => cfg?.leadSessionId ?? null,
    registerMember: async () => {},
    deregisterMember: async () => false,
    createInbox: async () => {},
    removeInbox: async () => false,
    findWorkerByWorktreePath: async () => null,
  };
}

function deps(cfg: TeamConfig | null, overrides?: Partial<ResumeTeamDeps>): ResumeTeamDeps {
  return {
    tmux: createMockTmux(),
    teamRepo: createMockTeamRepo(cfg),
    worktreeExists: async () => true,
    transcriptExists: async () => true,
    ...overrides,
  };
}

function asResult(r: ResumeTeamResult | { error: string }): ResumeTeamResult {
  if ("error" in r) {
    throw new Error(`expected result, got error: ${r.error}`);
  }
  return r;
}

describe("resumeTeam", () => {
  it("should return an error when the team does not exist", async () => {
    const r = await resumeTeam("ghost", deps(null));
    expect(r).toEqual({ error: "Team 'ghost' not found." });
  });

  it("should resume a healthy worker and pass --resume with team flags", async () => {
    let receivedCommand = "";
    let receivedDir = "";
    const r = asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), worker()]), {
          tmux: createMockTmux({
            createWindow: async (_name, dir, command) => {
              receivedDir = dir;
              receivedCommand = command ?? "";
              return "@1";
            },
          }),
        }),
      ),
    );
    expect(r.resumed).toEqual(["worker-a"]);
    expect(r.skipped).toEqual([]);
    expect(r.failed).toEqual([]);
    expect(receivedDir).toBe("/worktrees/worker-a");
    expect(receivedCommand).toContain("--resume '11111111-1111-1111-1111-111111111111'");
    expect(receivedCommand).toContain("--team-name 'my-team'");
    // --session-id must NOT appear: combined with --resume it requires
    // --fork-session, which the CLI otherwise rejects.
    expect(receivedCommand).not.toContain("--session-id");
  });

  it("should not resume the lead member", async () => {
    let createWindowCalls = 0;
    const r = asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember()]), {
          tmux: createMockTmux({
            createWindow: async () => {
              createWindowCalls++;
              return "@1";
            },
          }),
        }),
      ),
    );
    expect(createWindowCalls).toBe(0);
    expect(r.resumed).toEqual([]);
  });

  it("should skip a worker without a sessionId", async () => {
    const r = asResult(
      await resumeTeam("my-team", deps(config([leadMember(), worker({ sessionId: undefined })]))),
    );
    expect(r.skipped).toEqual([{ name: "worker-a", reason: "no-session-id" }]);
  });

  it("should skip a worker without a cwd", async () => {
    const r = asResult(
      await resumeTeam("my-team", deps(config([leadMember(), worker({ cwd: undefined })]))),
    );
    expect(r.skipped).toEqual([{ name: "worker-a", reason: "no-worktree" }]);
  });

  it("should skip a worker whose worktree is missing", async () => {
    const r = asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), worker()]), { worktreeExists: async () => false }),
      ),
    );
    expect(r.skipped).toEqual([{ name: "worker-a", reason: "worktree-missing" }]);
  });

  it("should skip a worker whose transcript is missing", async () => {
    const r = asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), worker()]), { transcriptExists: async () => false }),
      ),
    );
    expect(r.skipped).toEqual([{ name: "worker-a", reason: "no-transcript" }]);
  });

  it("should skip a worker that is already running (idempotency)", async () => {
    const r = asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), worker()]), {
          tmux: createMockTmux({ listPanePaths: async () => new Set(["/worktrees/worker-a"]) }),
        }),
      ),
    );
    expect(r.skipped).toEqual([{ name: "worker-a", reason: "already-running" }]);
  });

  it("should restore the recorded window name when present", async () => {
    let receivedName = "";
    asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), worker({ windowName: "my-window" })]), {
          tmux: createMockTmux({
            createWindow: async (name) => {
              receivedName = name;
              return "@1";
            },
          }),
        }),
      ),
    );
    expect(receivedName).toBe("my-window");
  });

  it("should fall back to the worktree's last segment when no window name is recorded", async () => {
    let receivedName = "";
    asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), worker({ windowName: undefined })]), {
          tmux: createMockTmux({
            createWindow: async (name) => {
              receivedName = name;
              return "@1";
            },
          }),
        }),
      ),
    );
    expect(receivedName).toBe("worker-a");
  });

  it("should report a worker that fails to launch", async () => {
    const r = asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), worker()]), {
          tmux: createMockTmux({
            createWindow: async () => {
              throw new Error("no tmux server");
            },
          }),
        }),
      ),
    );
    expect(r.resumed).toEqual([]);
    expect(r.failed).toEqual([{ name: "worker-a", error: "no tmux server" }]);
  });

  it("should classify a mix of resume, skip, and failure correctly", async () => {
    const healthy = worker({
      agentId: "w-ok@my-team",
      name: "w-ok",
      cwd: "/worktrees/w-ok",
      sessionId: "aaaa",
    });
    const noSession = worker({
      agentId: "w-old@my-team",
      name: "w-old",
      cwd: "/worktrees/w-old",
      sessionId: undefined,
    });
    const willFail = worker({
      agentId: "w-fail@my-team",
      name: "w-fail",
      cwd: "/worktrees/w-fail",
      sessionId: "bbbb",
    });
    const r = asResult(
      await resumeTeam(
        "my-team",
        deps(config([leadMember(), healthy, noSession, willFail]), {
          tmux: createMockTmux({
            createWindow: async (_name, dir) => {
              if (dir === "/worktrees/w-fail") {
                throw new Error("boom");
              }
              return "@1";
            },
          }),
        }),
      ),
    );
    expect(r.resumed).toEqual(["w-ok"]);
    expect(r.skipped).toEqual([{ name: "w-old", reason: "no-session-id" }]);
    expect(r.failed).toEqual([{ name: "w-fail", error: "boom" }]);
  });
});
