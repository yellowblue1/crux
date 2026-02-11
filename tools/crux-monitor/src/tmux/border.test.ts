import { describe, expect, it } from "bun:test";
import { extractContentAboveBorder } from "./border";

const border = "─".repeat(40);

describe("extractContentAboveBorder", () => {
  it("returns full content when no border lines exist", () => {
    const input = "line1\nline2\nline3";
    expect(extractContentAboveBorder(input)).toBe(input);
  });

  it("returns full content when only one border line exists", () => {
    const input = `line1\n${border}\nline2`;
    expect(extractContentAboveBorder(input)).toBe(input);
  });

  it("extracts content above standard bordered input area", () => {
    const input = [
      "Claude output here",
      border,
      "❯ user input",
      border,
      "  [Opus 4.6] 78% context",
    ].join("\n");
    expect(extractContentAboveBorder(input)).toBe("Claude output here");
  });

  it("handles border with embedded agent name", () => {
    const topBorder = `${"─".repeat(4)} @worker-name ${"─".repeat(22)}`;
    const input = ["output line", topBorder, "❯ typing here", border, "  status bar"].join("\n");
    expect(extractContentAboveBorder(input)).toBe("output line");
  });

  it("returns empty string when border is at the very top", () => {
    const input = [border, "❯ input", border, "status"].join("\n");
    expect(extractContentAboveBorder(input)).toBe("");
  });

  it("preserves multi-line content above border", () => {
    const input = ["line1", "line2", "line3", border, "❯ user", border, "status"].join("\n");
    expect(extractContentAboveBorder(input)).toBe("line1\nline2\nline3");
  });

  it("does not treat lines with few box-drawing characters as borders", () => {
    const input = [
      "has ── small decoration",
      "regular text",
      border,
      "❯ input",
      border,
      "status",
    ].join("\n");
    expect(extractContentAboveBorder(input)).toBe("has ── small decoration\nregular text");
  });

  it("trims trailing blank lines above border", () => {
    const input = ["output", "", "", border, "❯ input", border, "status"].join("\n");
    expect(extractContentAboveBorder(input)).toBe("output");
  });

  it("handles empty string input", () => {
    expect(extractContentAboveBorder("")).toBe("");
  });

  it("handles content with only borders and status bar", () => {
    const input = [border, "", border, "  [Opus 4.6] 78%"].join("\n");
    expect(extractContentAboveBorder(input)).toBe("");
  });

  it("uses the last border pair when multiple border pairs exist", () => {
    const input = [
      "section1",
      border,
      "middle content",
      border,
      "more content",
      border,
      "❯ user typing",
      border,
      "  status bar",
    ].join("\n");
    // The last pair is the input area at the bottom
    expect(extractContentAboveBorder(input)).toBe(
      `section1\n${border}\nmiddle content\n${border}\nmore content`,
    );
  });

  it("handles realistic Claude Code pane content", () => {
    const input = [
      "  crux-monitor Session Manager",
      "",
      "  Monitoring 3 Claude sessions...",
      "",
      "  Session: feat/add-auth  [WAITING]",
      "    Summary: Implemented OAuth2 login flow",
      "",
      "  Session: fix/bug-123  [BUSY]",
      "    Last activity: 2s ago",
      "",
      `${"─".repeat(60)}`,
      "❯ Can you help me refactor the authentication module to use",
      "  JWT tokens instead of session cookies?",
      `${"─".repeat(60)}`,
      "  [Opus 4.6] 78% context  -- INSERT --",
    ].join("\n");

    const expected = [
      "  crux-monitor Session Manager",
      "",
      "  Monitoring 3 Claude sessions...",
      "",
      "  Session: feat/add-auth  [WAITING]",
      "    Summary: Implemented OAuth2 login flow",
      "",
      "  Session: fix/bug-123  [BUSY]",
      "    Last activity: 2s ago",
    ].join("\n");

    expect(extractContentAboveBorder(input)).toBe(expected);
  });
});
