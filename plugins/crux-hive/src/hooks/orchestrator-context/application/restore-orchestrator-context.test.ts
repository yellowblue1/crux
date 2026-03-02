import { describe, expect, it } from "bun:test";
import type { TeamConfigReader } from "../domain/ports.js";
import type { OrchestratorState } from "../domain/types.js";
import { restoreOrchestratorContext } from "./restore-orchestrator-context.js";

function createMockReader(state: OrchestratorState | null): TeamConfigReader {
  return {
    findOrchestratorTeam: async (_sessionId: string) => state,
  };
}

function createFailingReader(): TeamConfigReader {
  return {
    findOrchestratorTeam: async () => {
      throw new Error("filesystem error");
    },
  };
}

describe("restoreOrchestratorContext", () => {
  it("should return context when orchestrator team is found", async () => {
    const state: OrchestratorState = {
      teamName: "test-project",
      workers: [{ name: "worker-a", isActive: true }],
    };
    const reader = createMockReader(state);

    const result = await restoreOrchestratorContext("session-123", {
      teamConfigReader: reader,
    });

    expect(result).not.toBeNull();
    expect(result).toContain("Orchestrator Mode");
    expect(result).toContain("test-project");
    expect(result).toContain("worker-a");
  });

  it("should return null when no orchestrator team is found", async () => {
    const reader = createMockReader(null);

    const result = await restoreOrchestratorContext("session-xyz", {
      teamConfigReader: reader,
    });

    expect(result).toBeNull();
  });

  it("should propagate errors from reader", async () => {
    const reader = createFailingReader();

    await expect(
      restoreOrchestratorContext("session-err", { teamConfigReader: reader }),
    ).rejects.toThrow("filesystem error");
  });
});
