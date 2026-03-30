import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClaudeConfigAdapter } from "./claude-config-adapter.js";

const testDir = join(import.meta.dir, "__test_config__");
const fakeHome = join(testDir, "fakehome");
const projectDir = join(testDir, "project");

beforeEach(() => {
  mkdirSync(join(fakeHome, ".crux"), { recursive: true });
  mkdirSync(join(projectDir, ".crux"), { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("readWorkerInstructions", () => {
  it("should return merged content when both global and project files exist", async () => {
    writeFileSync(join(fakeHome, ".crux", "worker-instructions.md"), "Global rules");
    writeFileSync(join(projectDir, ".crux", "worker-instructions.md"), "Project rules");
    const adapter = createClaudeConfigAdapter(fakeHome);

    const result = await adapter.readWorkerInstructions(projectDir);

    expect(result).toBe("Global rules\n\nProject rules");
  });

  it("should return global content when only global file exists", async () => {
    writeFileSync(join(fakeHome, ".crux", "worker-instructions.md"), "Global only");
    const adapter = createClaudeConfigAdapter(fakeHome);

    const result = await adapter.readWorkerInstructions(projectDir);

    expect(result).toBe("Global only");
  });

  it("should return project content when only project file exists", async () => {
    writeFileSync(join(projectDir, ".crux", "worker-instructions.md"), "Project only");
    const adapter = createClaudeConfigAdapter(fakeHome);

    const result = await adapter.readWorkerInstructions(projectDir);

    expect(result).toBe("Project only");
  });

  it("should return null when neither file exists", async () => {
    const adapter = createClaudeConfigAdapter(fakeHome);

    const result = await adapter.readWorkerInstructions(projectDir);

    expect(result).toBeNull();
  });

  it("should return null when files exist but are empty or whitespace-only", async () => {
    writeFileSync(join(fakeHome, ".crux", "worker-instructions.md"), "   \n\n  ");
    writeFileSync(join(projectDir, ".crux", "worker-instructions.md"), "");
    const adapter = createClaudeConfigAdapter(fakeHome);

    const result = await adapter.readWorkerInstructions(projectDir);

    expect(result).toBeNull();
  });

  it("should trim whitespace from file content", async () => {
    writeFileSync(join(fakeHome, ".crux", "worker-instructions.md"), "\n  Global rules\n\n");
    writeFileSync(join(projectDir, ".crux", "worker-instructions.md"), "  Project rules  \n");
    const adapter = createClaudeConfigAdapter(fakeHome);

    const result = await adapter.readWorkerInstructions(projectDir);

    expect(result).toBe("Global rules\n\nProject rules");
  });
});
