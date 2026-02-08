import { describe, expect, it } from "bun:test";
import { type EventType, handleEvent, type NotificationInput } from "./index";

function createMockLogToDb() {
  const calls: Array<{ eventType: string; summary: string }> = [];
  const logToDb = (eventType: string, summary: string) => {
    calls.push({ eventType, summary });
  };
  return { logToDb, calls };
}

describe("handleEvent", () => {
  describe("subagentstart", () => {
    it("should log SubagentStart with agent type and ID", async () => {
      const { logToDb, calls } = createMockLogToDb();
      const input: NotificationInput = {
        session_id: "test-session",
        agent_type: "Explore",
        agent_id: "agent-abc123",
      };

      await handleEvent("subagentstart", input, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("SubagentStart");
      expect(calls[0].summary).toBe("Started: Explore agent (agent-abc123)");
    });

    it("should handle missing agent fields gracefully", async () => {
      const { logToDb, calls } = createMockLogToDb();
      await handleEvent("subagentstart", {}, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("SubagentStart");
      expect(calls[0].summary).toBe("Started: unknown agent (unknown)");
    });
  });

  describe("subagentstop", () => {
    it("should log SubagentStop with agent type and ID", async () => {
      const { logToDb, calls } = createMockLogToDb();
      const input: NotificationInput = {
        session_id: "test-session",
        agent_type: "Bash",
        agent_id: "agent-def456",
      };

      await handleEvent("subagentstop", input, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("SubagentStop");
      expect(calls[0].summary).toBe("Finished: Bash agent (agent-def456)");
    });

    it("should handle missing agent fields gracefully", async () => {
      const { logToDb, calls } = createMockLogToDb();
      await handleEvent("subagentstop", {}, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("SubagentStop");
      expect(calls[0].summary).toBe("Finished: unknown agent (unknown)");
    });
  });

  describe("posttoolusefailure", () => {
    it("should log PostToolUseFailure with tool name and error", async () => {
      const { logToDb, calls } = createMockLogToDb();
      const input: NotificationInput = {
        session_id: "test-session",
        tool_name: "Bash",
        error: "Permission denied",
      };

      await handleEvent("posttoolusefailure", input, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("PostToolUseFailure");
      expect(calls[0].summary).toBe("Bash failed: Permission denied");
    });

    it("should truncate long error messages", async () => {
      const { logToDb, calls } = createMockLogToDb();
      const longError = "A".repeat(200);
      const input: NotificationInput = {
        session_id: "test-session",
        tool_name: "Write",
        error: longError,
      };

      await handleEvent("posttoolusefailure", input, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].summary).toContain("Write failed: ");
      expect(calls[0].summary).toContain("...");
      // "Write failed: " (14 chars) + 100 chars + "..." (3 chars) = 117 chars
      expect(calls[0].summary.length).toBe(117);
    });

    it("should handle missing fields gracefully", async () => {
      const { logToDb, calls } = createMockLogToDb();
      await handleEvent("posttoolusefailure", {}, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("PostToolUseFailure");
      expect(calls[0].summary).toBe("unknown failed: unknown error");
    });
  });

  describe("sessionstart", () => {
    it("should log SessionStart", async () => {
      const { logToDb, calls } = createMockLogToDb();
      await handleEvent("sessionstart", {}, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("SessionStart");
      expect(calls[0].summary).toBe("Session started");
    });
  });

  describe("sessionend", () => {
    it("should log SessionEnd with reason", async () => {
      const { logToDb, calls } = createMockLogToDb();
      await handleEvent("sessionend", { reason: "clear" }, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].eventType).toBe("SessionEnd");
      expect(calls[0].summary).toBe("reason=clear");
    });
  });

  describe("unknown event type", () => {
    it("should log unknown event as-is", async () => {
      const { logToDb, calls } = createMockLogToDb();
      await handleEvent("unknown" as EventType, {}, logToDb);

      expect(calls.length).toBe(1);
      expect(calls[0].summary).toBe("Unknown event");
    });
  });
});
