import { describe, expect, it } from "bun:test";
import type { CruxMarkdownReader, TeamConfigReader } from "../domain/ports.js";
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

function createMockMarkdownReader(content: string | null): CruxMarkdownReader {
  return {
    readOrchestratorSettings: async (_projectDir: string) => content,
  };
}

const defaultDeps = (
  teamReader: TeamConfigReader,
  mdReader: CruxMarkdownReader = createMockMarkdownReader(null),
) => ({
  teamConfigReader: teamReader,
  cruxMarkdownReader: mdReader,
});

describe("restoreOrchestratorContext", () => {
  it("should return context when orchestrator team is found", async () => {
    const state: OrchestratorState = {
      teamName: "test-project",
      workers: [{ name: "worker-a", isActive: true }],
    };

    const result = await restoreOrchestratorContext(
      "session-123",
      "/project",
      defaultDeps(createMockReader(state)),
    );

    expect(result).not.toBeNull();
    expect(result).toContain("Orchestrator Mode");
    expect(result).toContain("test-project");
    expect(result).toContain("worker-a");
  });

  it("should return null when no orchestrator team is found", async () => {
    const result = await restoreOrchestratorContext(
      "session-xyz",
      "/project",
      defaultDeps(createMockReader(null)),
    );

    expect(result).toBeNull();
  });

  it("should propagate errors from reader", async () => {
    await expect(
      restoreOrchestratorContext("session-err", "/project", defaultDeps(createFailingReader())),
    ).rejects.toThrow("filesystem error");
  });

  it("should include custom settings when orchestrator.md content exists", async () => {
    const state: OrchestratorState = {
      teamName: "test-project",
      workers: [],
    };
    const mdReader = createMockMarkdownReader("Prefer small tasks over large ones.");

    const result = await restoreOrchestratorContext(
      "session-123",
      "/project",
      defaultDeps(createMockReader(state), mdReader),
    );

    expect(result).toContain("## Custom Settings");
    expect(result).toContain("Prefer small tasks over large ones.");
  });

  it("should not include custom settings when orchestrator.md returns null", async () => {
    const state: OrchestratorState = {
      teamName: "test-project",
      workers: [],
    };

    const result = await restoreOrchestratorContext(
      "session-123",
      "/project",
      defaultDeps(createMockReader(state), createMockMarkdownReader(null)),
    );

    expect(result).not.toContain("## Custom Settings");
  });

  it("should not read orchestrator.md when no team is found", async () => {
    let readerCalled = false;
    const mdReader: CruxMarkdownReader = {
      readOrchestratorSettings: async () => {
        readerCalled = true;
        return "Should not be used";
      },
    };

    await restoreOrchestratorContext(
      "session-xyz",
      "/project",
      defaultDeps(createMockReader(null), mdReader),
    );

    expect(readerCalled).toBe(false);
  });
});
