import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CruxHiveConfig } from "./config.js";
import { loadConfig } from "./config.js";

const testDir = join(import.meta.dir, "__test_config__");

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function writeConfig(config: CruxHiveConfig): void {
  writeFileSync(join(testDir, ".crux-hive.json"), JSON.stringify(config, null, 2));
}

describe("loadConfig", () => {
  it("should return null when .crux-hive.json does not exist", () => {
    const result = loadConfig(testDir);
    expect(result).toBeNull();
  });

  it("should return parsed config when file exists and is valid", () => {
    const config: CruxHiveConfig = {
      qualityGates: {
        teammateIdle: {
          commands: [{ name: "lint", command: "bun run lint" }],
          timeout: 30000,
        },
        taskCompleted: {
          commands: [
            { name: "lint", command: "bun run lint" },
            { name: "test", command: "bun test" },
          ],
        },
      },
    };
    writeConfig(config);

    const result = loadConfig(testDir);

    expect(result).not.toBeNull();
    expect(result?.qualityGates?.teammateIdle?.commands).toHaveLength(1);
    expect(result?.qualityGates?.teammateIdle?.timeout).toBe(30000);
    expect(result?.qualityGates?.taskCompleted?.commands).toHaveLength(2);
  });

  it("should return null when file contains invalid JSON", () => {
    writeFileSync(join(testDir, ".crux-hive.json"), "not valid json{{{");

    const result = loadConfig(testDir);
    expect(result).toBeNull();
  });

  it("should return config with only teammateIdle defined", () => {
    const config: CruxHiveConfig = {
      qualityGates: {
        teammateIdle: {
          commands: [{ name: "lint", command: "bun run lint" }],
        },
      },
    };
    writeConfig(config);

    const result = loadConfig(testDir);

    expect(result?.qualityGates?.teammateIdle?.commands).toHaveLength(1);
    expect(result?.qualityGates?.taskCompleted).toBeUndefined();
  });

  it("should return config with only taskCompleted defined", () => {
    const config: CruxHiveConfig = {
      qualityGates: {
        taskCompleted: {
          commands: [{ name: "test", command: "bun test" }],
        },
      },
    };
    writeConfig(config);

    const result = loadConfig(testDir);

    expect(result?.qualityGates?.teammateIdle).toBeUndefined();
    expect(result?.qualityGates?.taskCompleted?.commands).toHaveLength(1);
  });

  it("should return config with empty commands arrays", () => {
    const config: CruxHiveConfig = {
      qualityGates: {
        teammateIdle: { commands: [] },
        taskCompleted: { commands: [] },
      },
    };
    writeConfig(config);

    const result = loadConfig(testDir);

    expect(result?.qualityGates?.teammateIdle?.commands).toHaveLength(0);
    expect(result?.qualityGates?.taskCompleted?.commands).toHaveLength(0);
  });

  it("should return config without qualityGates key", () => {
    writeFileSync(join(testDir, ".crux-hive.json"), JSON.stringify({ other: "value" }));

    const result = loadConfig(testDir);

    expect(result).not.toBeNull();
    expect(result?.qualityGates).toBeUndefined();
  });
});
