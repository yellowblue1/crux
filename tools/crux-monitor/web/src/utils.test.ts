import { describe, expect, it } from "bun:test";
import { escapeHtml, formatTime } from "./utils";

describe("formatTime", () => {
  it("formats ISO string to HH:MM format", () => {
    const result = formatTime("2024-01-15T14:30:00Z");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it("handles midnight correctly", () => {
    const result = formatTime("2024-01-15T00:00:00Z");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe("escapeHtml", () => {
  it("escapes less than sign", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("preserves double quotes in text content", () => {
    expect(escapeHtml('"quoted"')).toBe('"quoted"');
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("preserves normal text", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});
