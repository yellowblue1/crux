import { describe, expect, it } from "bun:test";
import { sanitizePaneContent, stripAnsiEscapes, stripDimText, stripPromptArea } from "./sanitize";

describe("sanitize", () => {
  describe("stripPromptArea", () => {
    it("strips prompt area with box-drawing border and ❯ marker", () => {
      const content = [
        "Some conversation output above",
        "Claude finished working on the task.",
        "╭──────────────────────────────────────╮",
        "│ ❯ fix the bug                        │",
        "╰──────────────────────────────────────╯",
        "  !builds  ↩ send  ⌥↩ newline  /help",
      ].join("\n");

      const result = stripPromptArea(content);
      expect(result).toBe(
        ["Some conversation output above", "Claude finished working on the task."].join("\n"),
      );
    });

    it("strips prompt area with suggestion ghost text", () => {
      const content = [
        "Done. All tests passing.",
        "╭──────────────────────────────────────╮",
        "│ ❯ fix the authentication module       │",
        "╰──────────────────────────────────────╯",
      ].join("\n");

      const result = stripPromptArea(content);
      expect(result).toBe("Done. All tests passing.");
    });

    it("returns content unchanged when no prompt area found", () => {
      const content = "Some conversation output\nwith multiple lines\nno prompt here";
      expect(stripPromptArea(content)).toBe(content);
    });

    it("returns empty string when content is only the prompt area", () => {
      const content = [
        "╭──────────────────────────────────────╮",
        "│ ❯                                     │",
        "╰──────────────────────────────────────╯",
      ].join("\n");

      const result = stripPromptArea(content);
      expect(result).toBe("");
    });

    it("handles empty string", () => {
      expect(stripPromptArea("")).toBe("");
    });

    it("preserves selection UI where ❯ is a selection indicator (no ╭ border)", () => {
      const content = [
        "Conversation content above",
        "Do you want to proceed?",
        " ❯ 1. Yes",
        "   2. No",
        "",
        " Esc to cancel",
      ].join("\n");

      // No ╭ border near ❯ — this is a selection UI, not the input prompt
      expect(stripPromptArea(content)).toBe(content);
    });

    it("only scans the last 20 lines for prompt area", () => {
      // ❯ appearing earlier in content (e.g., in code blocks) should not be stripped
      const lines = [];
      for (let i = 0; i < 30; i++) {
        lines.push(`Line ${i}`);
      }
      // Add ❯ at line 5 (well above the scan window)
      lines[5] = "The ❯ character appears in documentation";

      const content = lines.join("\n");
      expect(stripPromptArea(content)).toBe(content);
    });

    it("strips multi-line prompt input area", () => {
      const content = [
        "Conversation output",
        "╭──────────────────────────────────────╮",
        "│ ❯ first line of input                 │",
        "│   second line of input                 │",
        "╰──────────────────────────────────────╯",
      ].join("\n");

      const result = stripPromptArea(content);
      expect(result).toBe("Conversation output");
    });
  });

  describe("stripDimText", () => {
    it("removes basic dim block terminated by normal intensity", () => {
      const input = "hello \x1b[2msuggestion\x1b[22m world";
      expect(stripDimText(input)).toBe("hello  world");
    });

    it("removes dim block terminated by full reset", () => {
      const input = "hello \x1b[2msuggestion\x1b[0m world";
      expect(stripDimText(input)).toBe("hello  world");
    });

    it("removes dim block terminated by bare ESC[m", () => {
      const input = "hello \x1b[2msuggestion\x1b[m world";
      expect(stripDimText(input)).toBe("hello  world");
    });

    it("removes multiple dim blocks", () => {
      const input = "a \x1b[2mfirst\x1b[22m b \x1b[2msecond\x1b[0m c";
      expect(stripDimText(input)).toBe("a  b  c");
    });

    it("removes dim block with nested ANSI color codes", () => {
      const input = "text \x1b[2m\x1b[38;5;240mcolored dim\x1b[0m rest";
      expect(stripDimText(input)).toBe("text  rest");
    });

    it("returns unchanged when no dim text present", () => {
      const input = "normal text without any ANSI";
      expect(stripDimText(input)).toBe(input);
    });

    it("handles empty string", () => {
      expect(stripDimText("")).toBe("");
    });

    it("removes dim text at end of line", () => {
      const input = "prompt> \x1b[2msuggestion\x1b[22m";
      expect(stripDimText(input)).toBe("prompt> ");
    });

    it("removes dim text spanning a newline", () => {
      const input = "before \x1b[2mfirst line\nsecond line\x1b[0m after";
      expect(stripDimText(input)).toBe("before  after");
    });
  });

  describe("stripAnsiEscapes", () => {
    it("strips CSI color codes", () => {
      expect(stripAnsiEscapes("\x1b[31mred text\x1b[0m")).toBe("red text");
    });

    it("strips bold and underline sequences", () => {
      expect(stripAnsiEscapes("\x1b[1mbold\x1b[22m")).toBe("bold");
    });

    it("strips cursor movement sequences", () => {
      expect(stripAnsiEscapes("\x1b[2Aup two lines")).toBe("up two lines");
    });

    it("strips 256-color sequences", () => {
      expect(stripAnsiEscapes("\x1b[38;5;240mgray\x1b[0m")).toBe("gray");
    });

    it("returns unchanged when no escapes present", () => {
      const input = "plain text content";
      expect(stripAnsiEscapes(input)).toBe(input);
    });

    it("handles empty string", () => {
      expect(stripAnsiEscapes("")).toBe("");
    });

    it("strips mixed sequence types", () => {
      const input = "\x1b[1m\x1b[31mbold red\x1b[0m normal \x1b[4munderline\x1b[24m";
      expect(stripAnsiEscapes(input)).toBe("bold red normal underline");
    });
  });

  describe("sanitizePaneContent", () => {
    it("applies full pipeline: dim text + ANSI + prompt area", () => {
      const input = [
        "\x1b[1mClaude\x1b[0m finished the task.",
        "╭──────────────────────────────────────╮",
        "│ ❯ \x1b[2min the auth module\x1b[22m            │",
        "╰──────────────────────────────────────╯",
      ].join("\n");

      const result = sanitizePaneContent(input);
      expect(result).toBe("Claude finished the task.");
    });

    it("handles plain text without ANSI (passthrough)", () => {
      const input = "Some plain conversation content\nwith multiple lines";
      expect(sanitizePaneContent(input)).toBe(input);
    });

    it("collapses double spaces left by removed inline suggestions", () => {
      const input = "text \x1b[2msuggestion\x1b[0m  more text";
      const result = sanitizePaneContent(input);
      expect(result).toBe("text more text");
    });

    it("handles realistic Claude Code terminal output", () => {
      const input = [
        "\x1b[1m\x1b[34m❯\x1b[0m \x1b[1mClaude\x1b[0m",
        "",
        "I've fixed the authentication bug. The issue was in the token validation.",
        "",
        "\x1b[32m✓\x1b[0m All tests passing (42/42)",
        "",
        "╭──────────────────────────────────────────────────╮",
        "│ \x1b[34m❯\x1b[0m fix\x1b[2m the login timeout issue\x1b[22m          │",
        "╰──────────────────────────────────────────────────╯",
        "  \x1b[90m!builds  ↩ send  ⌥↩ newline  /help\x1b[0m",
      ].join("\n");

      const result = sanitizePaneContent(input);
      expect(result).toContain("fixed the authentication bug");
      expect(result).toContain("All tests passing");
      // Suggestion ghost text and prompt box are stripped
      expect(result).not.toContain("login timeout");
      expect(result).not.toContain("╭");
      expect(result).not.toContain("╰");
      // The ❯ in the header (line 1) is preserved — only the prompt area is stripped
      expect(result).toContain("Claude");
    });

    it("handles empty string", () => {
      expect(sanitizePaneContent("")).toBe("");
    });
  });
});
