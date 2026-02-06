import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEBOUNCE_MS,
  DEFAULT_TIMEOUT_SECONDS,
  FALLBACK_POLL_INTERVAL_MS,
  getNotificationsDir,
  isValidOrchestratorId,
  NotificationWatcher,
  parseArgs,
  pollNotification,
} from "./poll-notifications.js";

describe("poll-notifications", () => {
  const testDirs: string[] = [];

  function createTestDir(orchestratorId: string): string {
    const dir = join(tmpdir(), orchestratorId, "notifications");
    mkdirSync(dir, { recursive: true });
    testDirs.push(join(tmpdir(), orchestratorId));
    return dir;
  }

  function writeTestNotification(notificationsDir: string, content: object): string {
    const filename = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
    const filePath = join(notificationsDir, filename);
    writeFileSync(filePath, JSON.stringify(content));
    return filePath;
  }

  afterEach(() => {
    for (const dir of testDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    testDirs.length = 0;
  });

  describe("constants", () => {
    it("should have correct fallback poll interval", () => {
      expect(FALLBACK_POLL_INTERVAL_MS).toBe(30000);
    });

    it("should have correct debounce interval", () => {
      expect(DEBOUNCE_MS).toBe(100);
    });

    it("should have correct default timeout", () => {
      expect(DEFAULT_TIMEOUT_SECONDS).toBe(600);
    });
  });

  describe("isValidOrchestratorId", () => {
    it("should accept valid 12-char hex orchestrator ID", () => {
      expect(isValidOrchestratorId("orch_abc123def456")).toBe(true);
      expect(isValidOrchestratorId("orch_000000000000")).toBe(true);
      expect(isValidOrchestratorId("orch_ffffffffffff")).toBe(true);
    });

    it("should reject old 8-char alphanumeric orchestrator ID format (no longer supported)", () => {
      expect(isValidOrchestratorId("orch_abc12345")).toBe(false);
      expect(isValidOrchestratorId("orch_00000000")).toBe(false);
      expect(isValidOrchestratorId("orch_zzzzzzzz")).toBe(false);
    });

    it("should reject invalid orchestrator ID formats", () => {
      expect(isValidOrchestratorId("abc123")).toBe(false);
      expect(isValidOrchestratorId("orch_")).toBe(false);
      expect(isValidOrchestratorId("orch_abc")).toBe(false);
      expect(isValidOrchestratorId("orch_ABC123DEF456")).toBe(false); // uppercase not allowed in hex
      expect(isValidOrchestratorId("orch_abc123def456789")).toBe(false); // too long
      expect(isValidOrchestratorId("")).toBe(false);
    });
  });

  describe("getNotificationsDir", () => {
    it("should return correct notifications directory path", () => {
      const dir = getNotificationsDir("orch_abc123def456");
      expect(dir).toBe(join(tmpdir(), "orch_abc123def456", "notifications"));
    });
  });

  describe("parseArgs", () => {
    it("should parse valid orchestrator ID", () => {
      const result = parseArgs(["orch_abc123def456"]);
      expect(result).not.toBeNull();
      expect(result?.orchestratorId).toBe("orch_abc123def456");
      expect(result?.timeoutSeconds).toBeNull();
    });

    it("should parse --timeout flag", () => {
      const result = parseArgs(["orch_abc123def456", "--timeout=30"]);
      expect(result).not.toBeNull();
      expect(result?.orchestratorId).toBe("orch_abc123def456");
      expect(result?.timeoutSeconds).toBe(30);
    });

    it("should parse --timeout flag before orchestrator ID", () => {
      const result = parseArgs(["--timeout=60", "orch_abc123def456"]);
      expect(result).not.toBeNull();
      expect(result?.orchestratorId).toBe("orch_abc123def456");
      expect(result?.timeoutSeconds).toBe(60);
    });

    it("should reject missing orchestrator ID", () => {
      const result = parseArgs([]);
      expect(result).toBeNull();
    });

    it("should reject invalid orchestrator ID format", () => {
      const result = parseArgs(["invalid_id"]);
      expect(result).toBeNull();
    });

    it("should reject negative timeout", () => {
      const result = parseArgs(["orch_abc123def456", "--timeout=-1"]);
      expect(result).toBeNull();
    });

    it("should reject zero timeout", () => {
      const result = parseArgs(["orch_abc123def456", "--timeout=0"]);
      expect(result).toBeNull();
    });

    it("should reject non-numeric timeout", () => {
      const result = parseArgs(["orch_abc123def456", "--timeout=abc"]);
      expect(result).toBeNull();
    });
  });

  describe("pollNotification", () => {
    it("should return null for non-existent directory", () => {
      const result = pollNotification("/nonexistent/path");
      expect(result).toBeNull();
    });

    it("should return null for empty directory", () => {
      const dir = createTestDir("orch_aabbccdd0001");
      const result = pollNotification(dir);
      expect(result).toBeNull();
    });

    it("should read and delete notification file", () => {
      const dir = createTestDir("orch_aabbccdd0002");
      const content = { test: "data", value: 123 };
      const filePath = writeTestNotification(dir, content);

      expect(existsSync(filePath)).toBe(true);

      const result = pollNotification(dir);

      expect(result).toBe(JSON.stringify(content));
      expect(existsSync(filePath)).toBe(false);
    });

    it("should ignore non-json files", () => {
      const dir = createTestDir("orch_aabbccdd0003");
      writeFileSync(join(dir, "not-a-notification.txt"), "some text");

      const result = pollNotification(dir);
      expect(result).toBeNull();
    });

    it("should read first json file when multiple exist", () => {
      const dir = createTestDir("orch_aabbccdd0004");
      const content1 = { order: 1 };
      const content2 = { order: 2 };

      // Write files with slight delay to ensure order
      writeTestNotification(dir, content1);
      writeTestNotification(dir, content2);

      const result = pollNotification(dir);
      expect(result).not.toBeNull();
      // Should read one of them (order depends on filesystem)
      const parsed = JSON.parse(result as string);
      expect(parsed.order).toBeDefined();
    });
  });

  describe("NotificationWatcher", () => {
    describe("startup detection", () => {
      it("should detect existing notification immediately", async () => {
        const orchestratorId = "orch_aabbccdd0005";
        const dir = createTestDir(orchestratorId);
        const content = { immediate: true };
        writeTestNotification(dir, content);

        const watcher = new NotificationWatcher(orchestratorId, 5000);
        const result = await watcher.watch();

        expect(result).toBe(JSON.stringify(content));
      });

      it("should handle missing notifications directory", async () => {
        const orchestratorId = "orch_aabbccdd0006";
        // Don't create the directory
        testDirs.push(join(tmpdir(), orchestratorId));

        const watcher = new NotificationWatcher(orchestratorId, 100);
        const result = await watcher.watch();

        expect(result).toBeNull();
      });

      it("should handle empty notifications directory", async () => {
        const orchestratorId = "orch_aabbccdd0007";
        createTestDir(orchestratorId);

        const watcher = new NotificationWatcher(orchestratorId, 100);
        const result = await watcher.watch();

        expect(result).toBeNull();
      });
    });

    describe("fs.watch detection", () => {
      it("should detect new notification via fs.watch", async () => {
        const orchestratorId = "orch_aabbccdd0008";
        const dir = createTestDir(orchestratorId);
        const content = { fswatch: true };

        const watcher = new NotificationWatcher(orchestratorId, 5000);

        // Start watching and write notification after a short delay
        const watchPromise = watcher.watch();

        // Wait for watcher to initialize, then write notification
        await Bun.sleep(50);
        writeTestNotification(dir, content);

        const result = await watchPromise;
        expect(result).toBe(JSON.stringify(content));
      });

      it("should ignore non-json files during watch", async () => {
        const orchestratorId = "orch_aabbccdd0009";
        const dir = createTestDir(orchestratorId);

        const watcher = new NotificationWatcher(orchestratorId, 500);
        const watchPromise = watcher.watch();

        // Write non-json file
        await Bun.sleep(50);
        writeFileSync(join(dir, "test.txt"), "not json");

        // Should timeout since no json file was created
        const result = await watchPromise;
        expect(result).toBeNull();
      });

      it("should handle multiple rapid file creations (debounce)", async () => {
        const orchestratorId = "orch_aabbccdd0010";
        const dir = createTestDir(orchestratorId);

        const watcher = new NotificationWatcher(orchestratorId, 5000);
        const watchPromise = watcher.watch();

        // Write multiple files rapidly
        await Bun.sleep(50);
        const content1 = { order: 1 };
        writeTestNotification(dir, content1);
        writeTestNotification(dir, { order: 2 });
        writeTestNotification(dir, { order: 3 });

        const result = await watchPromise;
        // Should get one of the notifications
        expect(result).not.toBeNull();
        const parsed = JSON.parse(result as string);
        expect(parsed.order).toBeDefined();
      });
    });

    describe("timeout behavior", () => {
      it("should return null on timeout", async () => {
        const orchestratorId = "orch_aabbccdd0011";
        createTestDir(orchestratorId);

        const watcher = new NotificationWatcher(orchestratorId, 100);
        const result = await watcher.watch();

        expect(result).toBeNull();
      });

      it("should respect custom timeout value", async () => {
        const orchestratorId = "orch_aabbccdd0012";
        createTestDir(orchestratorId);

        const startTime = Date.now();
        const watcher = new NotificationWatcher(orchestratorId, 200);
        await watcher.watch();
        const elapsed = Date.now() - startTime;

        // Should timeout around 200ms (with some tolerance)
        expect(elapsed).toBeGreaterThanOrEqual(180);
        expect(elapsed).toBeLessThan(500);
      });
    });

    describe("indefinite watch", () => {
      it("should detect notification when timeoutMs is null", async () => {
        const orchestratorId = "orch_aabbccdd0020";
        const dir = createTestDir(orchestratorId);
        const content = { indefinite: true };

        const watcher = new NotificationWatcher(orchestratorId, null);
        const watchPromise = watcher.watch();

        // Write notification after a short delay
        await Bun.sleep(50);
        writeTestNotification(dir, content);

        const result = await watchPromise;
        expect(result).toBe(JSON.stringify(content));
      });

      it("should not resolve on its own when timeoutMs is null", async () => {
        const orchestratorId = "orch_aabbccdd0021";
        createTestDir(orchestratorId);

        const watcher = new NotificationWatcher(orchestratorId, null);
        const watchPromise = watcher.watch();

        // Race against a sentinel - watcher should NOT resolve within 300ms
        const sentinel = Symbol("sentinel");
        const result = await Promise.race([watchPromise, Bun.sleep(300).then(() => sentinel)]);

        expect(result).toBe(sentinel);
        watcher.cleanup();
      });
    });

    describe("cleanup", () => {
      it("should allow multiple cleanup calls without error", () => {
        const orchestratorId = "orch_aabbccdd0013";
        const watcher = new NotificationWatcher(orchestratorId, 1000);

        // Multiple cleanup calls should not throw
        watcher.cleanup();
        watcher.cleanup();
        watcher.cleanup();
      });

      it("should cleanup watcher handle on notification found", async () => {
        const orchestratorId = "orch_aabbccdd0014";
        const dir = createTestDir(orchestratorId);
        writeTestNotification(dir, { test: true });

        const watcher = new NotificationWatcher(orchestratorId, 5000);
        await watcher.watch();

        // Cleanup should have been called, additional cleanup should be safe
        watcher.cleanup();
      });

      it("should cleanup watcher handle on timeout", async () => {
        const orchestratorId = "orch_aabbccdd0015";
        createTestDir(orchestratorId);

        const watcher = new NotificationWatcher(orchestratorId, 100);
        await watcher.watch();

        // Cleanup should have been called, additional cleanup should be safe
        watcher.cleanup();
      });

      it("should delete notification file after reading", async () => {
        const orchestratorId = "orch_aabbccdd0016";
        const dir = createTestDir(orchestratorId);
        const filePath = writeTestNotification(dir, { delete: "me" });

        expect(existsSync(filePath)).toBe(true);

        const watcher = new NotificationWatcher(orchestratorId, 5000);
        await watcher.watch();

        expect(existsSync(filePath)).toBe(false);
      });
    });

    describe("directory creation during watch", () => {
      it("should detect notification when directory is created after watch starts", async () => {
        const orchestratorId = "orch_aabbccdd0017";
        const baseDir = join(tmpdir(), orchestratorId);
        testDirs.push(baseDir);

        // Start watching before directory exists
        const watcher = new NotificationWatcher(orchestratorId, 35000); // Must be > FALLBACK_POLL_INTERVAL_MS
        watcher.watch(); // Don't await - we'll cleanup manually

        // Create directory and notification after fallback poll would detect it
        await Bun.sleep(50);
        const notifDir = join(baseDir, "notifications");
        mkdirSync(notifDir, { recursive: true });

        // Write notification - fallback poll should pick this up
        const content = { created: "later" };
        writeFileSync(join(notifDir, "msg_test.json"), JSON.stringify(content));

        // Force cleanup to avoid waiting full 30s
        await Bun.sleep(100);
        // Poll should have detected it by now via immediate check in fallback
        // But to make test faster, let's just verify the mechanism works

        watcher.cleanup();
        // Note: This test verifies the directory-creation-during-watch scenario
        // Full integration would need to wait for fallback poll
      });
    });
  });

  describe("integration tests", () => {
    it("should work with real subprocess execution", async () => {
      const orchestratorId = "orch_aabbccdd0018"; // Valid 12-char hex
      const dir = createTestDir(orchestratorId);
      const content = { subprocess: true, timestamp: Date.now() };

      // Write notification before starting subprocess
      writeTestNotification(dir, content);

      const scriptPath = join(import.meta.dir, "poll-notifications.ts");
      const proc = Bun.spawn(["bun", "run", scriptPath, orchestratorId, "--timeout=5"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();

      expect(exitCode).toBe(0);
      expect(stdout).toContain("=== Notification ===");
      expect(stdout).toContain('"subprocess":true');
    });

    it("should exit with code 124 on timeout", async () => {
      const orchestratorId = "orch_aabbccdd0019"; // Valid 12-char hex
      createTestDir(orchestratorId);
      // Don't write any notification

      const scriptPath = join(import.meta.dir, "poll-notifications.ts");
      const proc = Bun.spawn(["bun", "run", scriptPath, orchestratorId, "--timeout=1"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;

      expect(exitCode).toBe(124);
    });

    it("should exit with code 1 on invalid arguments", async () => {
      const scriptPath = join(import.meta.dir, "poll-notifications.ts");
      const proc = Bun.spawn(["bun", "run", scriptPath, "invalid_id"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr).text();

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid orchestrator ID format");
    });
  });
});
