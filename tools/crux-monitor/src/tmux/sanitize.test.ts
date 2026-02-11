import { describe, expect, it } from "bun:test";
import { sanitizePaneContent, skipBottomLines, stripAnsiEscapes, stripDimText } from "./sanitize";

describe("sanitize", () => {
  describe("skipBottomLines", () => {
    it("removes the bottom 10 lines from content", () => {
      const lines = [];
      for (let i = 0; i < 20; i++) {
        lines.push(`Line ${i}`);
      }
      const result = skipBottomLines(lines.join("\n"));
      const resultLines = result.split("\n");
      expect(resultLines).toHaveLength(10);
      expect(resultLines[0]).toBe("Line 0");
      expect(resultLines[9]).toBe("Line 9");
    });

    it("keeps at least 1 line even if content is short", () => {
      const content = "Only line";
      expect(skipBottomLines(content)).toBe("Only line");
    });

    it("handles content with exactly 10 lines", () => {
      const lines = [];
      for (let i = 0; i < 10; i++) {
        lines.push(`Line ${i}`);
      }
      const result = skipBottomLines(lines.join("\n"));
      expect(result).toBe("Line 0");
    });

    it("handles empty string", () => {
      expect(skipBottomLines("")).toBe("");
    });

    it("ignores prompt area changes at the bottom", () => {
      const contentBefore = [
        "Claude finished the task.",
        "All tests passing.",
        "──────────────────────────────────────────",
        "❯ ",
        "───────────────────────────────────────────",
        "[Opus 4.6] 82% context remaining",
      ].join("\n");

      const contentAfter = [
        "Claude finished the task.",
        "All tests passing.",
        "──────────────────────────────────────────",
        "❯ fix the bug",
        "───────────────────────────────────────────",
        "[Opus 4.6] 82% context remaining",
      ].join("\n");

      // Both produce the same result because the prompt area is in the bottom lines
      expect(skipBottomLines(contentBefore)).toBe(skipBottomLines(contentAfter));
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
    it("strips dim text and ANSI codes, preserves prompt area", () => {
      const input = [
        "\x1b[1mClaude\x1b[0m finished the task.",
        "╭──────────────────────────────────────╮",
        "│ ❯ \x1b[2min the auth module\x1b[22m            │",
        "╰──────────────────────────────────────╯",
      ].join("\n");

      const result = sanitizePaneContent(input);
      // Prompt area is preserved (Gemini needs it for interaction detection)
      expect(result).toContain("Claude finished the task.");
      expect(result).toContain("❯");
      // Suggestion ghost text is stripped
      expect(result).not.toContain("in the auth module");
      // ANSI codes are stripped
      expect(result).not.toContain("\x1b[");
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

    it("preserves prompt area and selection UIs for Gemini", () => {
      const input = [
        "\x1b[1mClaude\x1b[0m",
        "",
        "Which database should we use?",
        "",
        " \x1b[34m❯\x1b[0m 1. PostgreSQL",
        "   2. MySQL",
        "   3. SQLite",
        "",
        " Esc to cancel",
      ].join("\n");

      const result = sanitizePaneContent(input);
      expect(result).toContain("Which database should we use?");
      // Selection UI is preserved for Gemini to generate dynamic UI
      expect(result).toContain("❯ 1. PostgreSQL");
      expect(result).toContain("2. MySQL");
      expect(result).toContain("3. SQLite");
    });

    it("preserves solid-border prompt area for Gemini", () => {
      const input = [
        "\x1b[1mClaude\x1b[0m finished the task.",
        "",
        "──────────────── @worker-name ──",
        "\x1b[34m❯\x1b[0m fix\x1b[2m the login timeout issue\x1b[22m",
        "───────────────────────────────────────────",
        "  \x1b[90m[Opus 4.6] 82% context remaining\x1b[0m",
      ].join("\n");

      const result = sanitizePaneContent(input);
      expect(result).toContain("Claude finished the task.");
      // Prompt area borders are preserved
      expect(result).toContain("──────────────── @worker-name ──");
      expect(result).toContain("❯ fix");
      // Suggestion ghost text is still stripped
      expect(result).not.toContain("login timeout issue");
    });

    it("handles empty string", () => {
      expect(sanitizePaneContent("")).toBe("");
    });
  });
});
