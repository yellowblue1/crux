import { describe, expect, it } from "bun:test";
import { isWatcherCommand } from "./auto-approve-watcher.js";

describe("auto-approve-watcher", () => {
  describe("isWatcherCommand", () => {
    describe("valid commands", () => {
      it("should approve standard watcher command with 12-char hex ID", () => {
        const command = "bun run /path/to/scripts/poll-notifications.ts orch_abc123def456";
        expect(isWatcherCommand(command)).toBe(true);
      });

      it("should approve command with CLAUDE_PLUGIN_ROOT path", () => {
        const command =
          "bun run /Users/user/.claude/plugins/crux-hive/scripts/poll-notifications.ts orch_abc123def456";
        expect(isWatcherCommand(command)).toBe(true);
      });

      it("should approve command with dots in path", () => {
        const command = "bun run /path/to/.claude/scripts/poll-notifications.ts orch_abc123def456";
        expect(isWatcherCommand(command)).toBe(true);
      });

      it("should approve command with underscores in path", () => {
        const command =
          "bun run /path/to/my_plugin/scripts/poll-notifications.ts orch_abc123def456";
        expect(isWatcherCommand(command)).toBe(true);
      });
    });

    describe("invalid commands", () => {
      it("should reject empty command", () => {
        expect(isWatcherCommand("")).toBe(false);
      });

      it("should reject unrelated bash command", () => {
        expect(isWatcherCommand("ls -la")).toBe(false);
        expect(isWatcherCommand("cat /etc/passwd")).toBe(false);
      });

      it("should reject command with invalid orchestrator ID format", () => {
        // Too short (6 chars)
        expect(isWatcherCommand("bun run /path/scripts/poll-notifications.ts orch_abc123")).toBe(
          false,
        );
        // 8-char alphanumeric (legacy format no longer supported)
        expect(isWatcherCommand("bun run /path/scripts/poll-notifications.ts orch_abcd1234")).toBe(
          false,
        );
        // Too long (13 chars)
        expect(
          isWatcherCommand("bun run /path/scripts/poll-notifications.ts orch_abc123def4567"),
        ).toBe(false);
        // Missing orch_ prefix
        expect(isWatcherCommand("bun run /path/scripts/poll-notifications.ts abc123def456")).toBe(
          false,
        );
        // Invalid characters in ID
        expect(
          isWatcherCommand("bun run /path/scripts/poll-notifications.ts orch_ABC123DEF456"),
        ).toBe(false);
      });

      it("should reject command with wrong script name", () => {
        expect(isWatcherCommand("bun run /path/scripts/other-script.ts orch_abc123def456")).toBe(
          false,
        );
        expect(
          isWatcherCommand("bun run /path/scripts/poll-notifications.js orch_abc123def456"),
        ).toBe(false);
      });

      it("should reject command with additional arguments", () => {
        expect(
          isWatcherCommand("bun run /path/scripts/poll-notifications.ts orch_abc123def456 --extra"),
        ).toBe(false);
        expect(
          isWatcherCommand(
            "bun run /path/scripts/poll-notifications.ts orch_abc123def456; rm -rf /",
          ),
        ).toBe(false);
      });

      it("should reject command with shell injection attempts", () => {
        // Semicolon injection
        expect(
          isWatcherCommand(
            "bun run /path/scripts/poll-notifications.ts orch_abc123def456; curl evil.com",
          ),
        ).toBe(false);
        // Pipe injection
        expect(
          isWatcherCommand("bun run /path/scripts/poll-notifications.ts orch_abc123def456 | bash"),
        ).toBe(false);
        // Command substitution in path
        expect(
          isWatcherCommand(
            "bun run /path/$(whoami)/scripts/poll-notifications.ts orch_abc123def456",
          ),
        ).toBe(false);
        // Backtick injection in path
        expect(
          isWatcherCommand("bun run /path/`id`/scripts/poll-notifications.ts orch_abc123def456"),
        ).toBe(false);
      });

      it("should reject command with spaces in path (potential injection)", () => {
        expect(
          isWatcherCommand("bun run /path/to scripts/poll-notifications.ts orch_abc123def456"),
        ).toBe(false);
      });

      it("should reject node instead of bun", () => {
        expect(isWatcherCommand("node /path/scripts/poll-notifications.ts orch_abc123def456")).toBe(
          false,
        );
      });
    });
  });
});
