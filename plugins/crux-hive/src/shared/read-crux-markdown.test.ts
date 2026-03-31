import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCruxMarkdownFile } from "./read-crux-markdown.js";

const testDir = join(import.meta.dir, "__test_crux_md__");
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

describe("readCruxMarkdownFile", () => {
  it("should return merged content when both global and project files exist", async () => {
    writeFileSync(join(fakeHome, ".crux", "orchestrator.md"), "Global settings");
    writeFileSync(join(projectDir, ".crux", "orchestrator.md"), "Project settings");

    const result = await readCruxMarkdownFile("orchestrator.md", projectDir, fakeHome);

    expect(result).toBe("Global settings\n\nProject settings");
  });

  it("should return global content when only global file exists", async () => {
    writeFileSync(join(fakeHome, ".crux", "orchestrator.md"), "Global only");

    const result = await readCruxMarkdownFile("orchestrator.md", projectDir, fakeHome);

    expect(result).toBe("Global only");
  });

  it("should return project content when only project file exists", async () => {
    writeFileSync(join(projectDir, ".crux", "orchestrator.md"), "Project only");

    const result = await readCruxMarkdownFile("orchestrator.md", projectDir, fakeHome);

    expect(result).toBe("Project only");
  });

  it("should return null when neither file exists", async () => {
    const result = await readCruxMarkdownFile("orchestrator.md", projectDir, fakeHome);

    expect(result).toBeNull();
  });

  it("should return null when files exist but are empty or whitespace-only", async () => {
    writeFileSync(join(fakeHome, ".crux", "orchestrator.md"), "   \n\n  ");
    writeFileSync(join(projectDir, ".crux", "orchestrator.md"), "");

    const result = await readCruxMarkdownFile("orchestrator.md", projectDir, fakeHome);

    expect(result).toBeNull();
  });

  it("should trim whitespace from file content", async () => {
    writeFileSync(join(fakeHome, ".crux", "orchestrator.md"), "\n  Global settings\n\n");
    writeFileSync(join(projectDir, ".crux", "orchestrator.md"), "  Project settings  \n");

    const result = await readCruxMarkdownFile("orchestrator.md", projectDir, fakeHome);

    expect(result).toBe("Global settings\n\nProject settings");
  });

  it("should work with different filenames", async () => {
    writeFileSync(join(fakeHome, ".crux", "worker-instructions.md"), "Worker global");
    writeFileSync(join(projectDir, ".crux", "worker-instructions.md"), "Worker project");

    const result = await readCruxMarkdownFile("worker-instructions.md", projectDir, fakeHome);

    expect(result).toBe("Worker global\n\nWorker project");
  });
});
