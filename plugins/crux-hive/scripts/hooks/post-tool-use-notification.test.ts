import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAdditionalContext,
  getOrchestratorId,
  hasNotificationBeenSent,
  markNotificationSent,
} from "./post-tool-use-notification";

describe("getOrchestratorId", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `post-tool-use-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    // Initialize as a git repo for findGitRoot to work
    mkdirSync(join(testDir, ".git"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should return orchestrator ID when file exists", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, ".orchestrator-id"), "orch_abc123\n");

    const result = getOrchestratorId(testDir);
    expect(result).toBe("orch_abc123");
  });

  it("should return null when .orchestrator-id file does not exist", () => {
    const result = getOrchestratorId(testDir);
    expect(result).toBeNull();
  });

  it("should return null when .claude directory does not exist", () => {
    const result = getOrchestratorId(testDir);
    expect(result).toBeNull();
  });

  it("should trim whitespace from orchestrator ID", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, ".orchestrator-id"), "  orch_xyz789  \n");

    const result = getOrchestratorId(testDir);
    expect(result).toBe("orch_xyz789");
  });
});

describe("hasNotificationBeenSent", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `post-tool-use-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, ".git"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should return true when notification-sent file exists", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, ".notification-sent"), "2024-01-15T10:00:00.000Z");

    const result = hasNotificationBeenSent(testDir);
    expect(result).toBe(true);
  });

  it("should return false when notification-sent file does not exist", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    const result = hasNotificationBeenSent(testDir);
    expect(result).toBe(false);
  });

  it("should return false when .claude directory does not exist", () => {
    const result = hasNotificationBeenSent(testDir);
    expect(result).toBe(false);
  });
});

describe("markNotificationSent", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `post-tool-use-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, ".git"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should create notification-sent file when .claude directory exists", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    markNotificationSent(testDir);

    expect(existsSync(join(claudeDir, ".notification-sent"))).toBe(true);
  });

  it("should not create .claude directory if it does not exist", () => {
    markNotificationSent(testDir);

    expect(existsSync(join(testDir, ".claude"))).toBe(false);
  });
});

describe("buildAdditionalContext", () => {
  it("should include orchestrator ID in the context", () => {
    const context = buildAdditionalContext("orch_abc123");

    expect(context).toContain("orch_abc123");
  });

  it("should include send_message tool reference", () => {
    const context = buildAdditionalContext("orch_123");

    expect(context).toContain("mcp__plugin_crux-hive_crux__send_message");
  });

  it("should include message_type options", () => {
    const context = buildAdditionalContext("orch_123");

    expect(context).toContain("task_complete");
    expect(context).toContain("task_failed");
    expect(context).toContain("question");
  });

  it("should include content structure hints", () => {
    const context = buildAdditionalContext("orch_123");

    expect(context).toContain("summary");
    expect(context).toContain("pr_url");
    expect(context).toContain("branch");
  });

  it("should include IMPORTANT prefix", () => {
    const context = buildAdditionalContext("orch_123");

    expect(context).toContain("IMPORTANT:");
  });

  it("should mention orchestrator is waiting", () => {
    const context = buildAdditionalContext("orch_xyz");

    expect(context).toContain("orchestrator");
    expect(context).toContain("waiting");
  });
});

describe("integration scenarios", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `post-tool-use-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, ".git"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should correctly identify orchestrated session that needs notification", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, ".orchestrator-id"), "orch_integration_test");

    const orchestratorId = getOrchestratorId(testDir);
    const alreadyNotified = hasNotificationBeenSent(testDir);

    expect(orchestratorId).toBe("orch_integration_test");
    expect(alreadyNotified).toBe(false);
  });

  it("should correctly identify orchestrated session that has already notified", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, ".orchestrator-id"), "orch_integration_test");
    writeFileSync(join(claudeDir, ".notification-sent"), "2024-01-15T10:00:00.000Z");

    const orchestratorId = getOrchestratorId(testDir);
    const alreadyNotified = hasNotificationBeenSent(testDir);

    expect(orchestratorId).toBe("orch_integration_test");
    expect(alreadyNotified).toBe(true);
  });

  it("should correctly identify non-orchestrated session", () => {
    const orchestratorId = getOrchestratorId(testDir);

    expect(orchestratorId).toBeNull();
  });

  it("should mark notification as sent and subsequent check should return true", () => {
    const claudeDir = join(testDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    expect(hasNotificationBeenSent(testDir)).toBe(false);

    markNotificationSent(testDir);

    expect(hasNotificationBeenSent(testDir)).toBe(true);
  });
});
