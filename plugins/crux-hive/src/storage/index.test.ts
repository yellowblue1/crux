import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOrchestratorSession,
  getNotificationCount,
  getOrchestratorSession,
  pollNotifications,
  writeNotification,
} from "./index.js";

describe("file-based storage", () => {
  const testOrchestratorIds: string[] = [];

  // Helper to track created orchestrators for cleanup
  function trackOrchestrator(id: string): void {
    testOrchestratorIds.push(id);
  }

  // Cleanup test directories after each test
  afterEach(() => {
    for (const id of testOrchestratorIds) {
      const dir = join(tmpdir(), id);
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    testOrchestratorIds.length = 0;
  });

  describe("createOrchestratorSession", () => {
    it("should create an orchestrator session with correct structure", () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      // New format: 12 hex characters (cryptographically secure)
      expect(session.id).toMatch(/^orch_[a-f0-9]{12}$/);
      expect(session.project_dir).toBe("/test/project");
      expect(session.created_at).toBeDefined();

      // Verify directory structure
      const orchestratorDir = join(tmpdir(), session.id);
      expect(existsSync(orchestratorDir)).toBe(true);
      expect(existsSync(join(orchestratorDir, "session.json"))).toBe(true);
      expect(existsSync(join(orchestratorDir, "notifications"))).toBe(true);
      expect(existsSync(join(orchestratorDir, "notifications_read"))).toBe(true);
    });

    it("should create unique IDs for each session", () => {
      const session1 = createOrchestratorSession("/project1");
      const session2 = createOrchestratorSession("/project2");
      trackOrchestrator(session1.id);
      trackOrchestrator(session2.id);

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe("getOrchestratorSession", () => {
    it("should retrieve an existing session", () => {
      const created = createOrchestratorSession("/test/project");
      trackOrchestrator(created.id);

      const retrieved = getOrchestratorSession(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.project_dir).toBe(created.project_dir);
      expect(retrieved?.created_at).toBe(created.created_at);
    });

    it("should return null for non-existent session", () => {
      // Use a valid format ID that doesn't exist
      const result = getOrchestratorSession("orch_000000000000");

      expect(result).toBeNull();
    });
  });

  describe("writeNotification", () => {
    it("should write a notification file", () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      const message = writeNotification(session.id, "worker-1", "task_complete", {
        summary: "Task completed",
        pr_url: "https://github.com/org/repo/pull/123",
      });

      expect(message.id).toMatch(/^msg_/);
      expect(message.orchestrator_id).toBe(session.id);
      expect(message.worker_id).toBe("worker-1");
      expect(message.message_type).toBe("task_complete");
      expect(message.content.summary).toBe("Task completed");
      expect(message.content.pr_url).toBe("https://github.com/org/repo/pull/123");

      // Verify file exists in notifications directory
      const notificationsDir = join(tmpdir(), session.id, "notifications");
      const files = readdirSync(notificationsDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^msg_.*\.json$/);
    });

    it("should handle null worker_id", () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      const message = writeNotification(session.id, undefined, "task_failed", {
        summary: "Build failed",
        error: "TypeScript error",
      });

      expect(message.worker_id).toBeNull();
    });
  });

  describe("pollNotifications", () => {
    it("should return and mark messages as read", () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      // Write some notifications
      writeNotification(session.id, "worker-1", "task_complete", { summary: "Task 1 done" });
      writeNotification(session.id, "worker-2", "task_complete", { summary: "Task 2 done" });

      // Poll for messages
      const messages = pollNotifications(session.id);

      expect(messages.length).toBe(2);

      // Verify messages moved to read directory
      const notificationsDir = join(tmpdir(), session.id, "notifications");
      const readDir = join(tmpdir(), session.id, "notifications_read");

      expect(readdirSync(notificationsDir).length).toBe(0);
      expect(readdirSync(readDir).length).toBe(2);
    });

    it("should return empty array when no unread messages", () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      const messages = pollNotifications(session.id);

      expect(messages).toEqual([]);
    });

    it("should return messages in chronological order", async () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      writeNotification(session.id, "worker-1", "task_complete", { summary: "First" });
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      writeNotification(session.id, "worker-2", "task_complete", { summary: "Second" });

      const messages = pollNotifications(session.id);

      expect(messages[0].content.summary).toBe("First");
      expect(messages[1].content.summary).toBe("Second");
    });
  });

  describe("getNotificationCount", () => {
    it("should return correct unread and total counts", () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      // Write notifications
      writeNotification(session.id, "worker-1", "task_complete", { summary: "Task 1" });
      writeNotification(session.id, "worker-2", "task_complete", { summary: "Task 2" });
      writeNotification(session.id, "worker-3", "task_complete", { summary: "Task 3" });

      // Check counts before polling
      let counts = getNotificationCount(session.id);
      expect(counts.unread).toBe(3);
      expect(counts.total).toBe(3);

      // Poll to mark as read
      pollNotifications(session.id);

      // Check counts after polling
      counts = getNotificationCount(session.id);
      expect(counts.unread).toBe(0);
      expect(counts.total).toBe(3);
    });

    it("should return zero counts for new session", () => {
      const session = createOrchestratorSession("/test/project");
      trackOrchestrator(session.id);

      const counts = getNotificationCount(session.id);

      expect(counts.unread).toBe(0);
      expect(counts.total).toBe(0);
    });
  });
});

describe("ID generation", () => {
  it("should generate IDs with correct prefix pattern", () => {
    const session = createOrchestratorSession("/test");
    // Cleanup
    const dir = join(tmpdir(), session.id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }

    // New format: 12 hex characters (cryptographically secure)
    expect(session.id).toMatch(/^orch_[a-f0-9]{12}$/);
  });
});

describe("message content structure", () => {
  let session: { id: string };

  beforeEach(() => {
    session = createOrchestratorSession("/test/project");
  });

  afterEach(() => {
    const dir = join(tmpdir(), session.id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("should handle task_complete content", () => {
    const message = writeNotification(session.id, "worker-1", "task_complete", {
      summary: "Task completed successfully",
      details: "Implemented feature X",
      pr_url: "https://github.com/org/repo/pull/123",
      branch: "feat/add-feature",
    });

    expect(message.content.summary).toBe("Task completed successfully");
    expect(message.content.details).toBe("Implemented feature X");
    expect(message.content.pr_url).toBe("https://github.com/org/repo/pull/123");
    expect(message.content.branch).toBe("feat/add-feature");
  });

  it("should handle task_failed content with error", () => {
    const message = writeNotification(session.id, "worker-1", "task_failed", {
      summary: "Build failed",
      error: "TypeScript compilation error in src/index.ts:42",
    });

    expect(message.content.summary).toBe("Build failed");
    expect(message.content.error).toBe("TypeScript compilation error in src/index.ts:42");
  });

  it("should handle question content", () => {
    const message = writeNotification(session.id, "worker-1", "question", {
      summary: "Need clarification",
      question: "Should the API return 404 or 204 for empty results?",
    });

    expect(message.content.summary).toBe("Need clarification");
    expect(message.content.question).toBe("Should the API return 404 or 204 for empty results?");
  });
});
