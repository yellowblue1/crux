import { describe, expect, it } from "bun:test";
import { buildOrchestratorContext } from "./build-context.js";
import type { OrchestratorState } from "./types.js";

describe("buildOrchestratorContext", () => {
  it("should include team name and worker table", () => {
    const state: OrchestratorState = {
      teamName: "my-project",
      workers: [
        { name: "worker-auth", isActive: true },
        { name: "worker-ui", isActive: false },
      ],
    };

    const result = buildOrchestratorContext(state);

    expect(result).toContain("Team: **my-project**");
    expect(result).toContain("| worker-auth | active |");
    expect(result).toContain("| worker-ui | idle |");
  });

  it("should show 'No workers' when workers list is empty", () => {
    const state: OrchestratorState = {
      teamName: "empty-team",
      workers: [],
    };

    const result = buildOrchestratorContext(state);

    expect(result).toContain("No workers currently registered.");
    expect(result).not.toContain("| Name | Status |");
  });

  it("should include core rules", () => {
    const state: OrchestratorState = {
      teamName: "test",
      workers: [],
    };

    const result = buildOrchestratorContext(state);

    expect(result).toContain("NEVER execute tasks directly");
    expect(result).toContain("One task per worker");
    expect(result).toContain("planMode: true");
    expect(result).toContain("Delegate research too");
  });

  it("should include quick reference table", () => {
    const state: OrchestratorState = {
      teamName: "test",
      workers: [],
    };

    const result = buildOrchestratorContext(state);

    expect(result).toContain("Quick Reference");
    expect(result).toContain("`TeamCreate`");
    expect(result).toContain("`start_worktree_session`");
    expect(result).toContain("`SendMessage`");
    expect(result).toContain("`gh pr merge");
    expect(result).toContain("`git gtr rm");
  });

  it("should include phase descriptions", () => {
    const state: OrchestratorState = {
      teamName: "test",
      workers: [],
    };

    const result = buildOrchestratorContext(state);

    expect(result).toContain("Delegation");
    expect(result).toContain("Communication");
    expect(result).toContain("PR Review");
    expect(result).toContain("Cleanup");
  });
});
