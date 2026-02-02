import { describe, expect, it } from "bun:test";
import { escapeHtml, formatTime, isAiSummary, parseEventType } from "./utils";

describe("formatTime", () => {
  it("formats ISO string to HH:MM format", () => {
    // Use a fixed timezone for consistent tests
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
    // textContent/innerHTML only escapes < > & for text content
    // quotes don't need escaping in HTML text (only in attributes)
    expect(escapeHtml('"quoted"')).toBe('"quoted"');
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("preserves normal text", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

describe("parseEventType", () => {
  it("parses simple event type", () => {
    const result = parseEventType("Stop");
    expect(result).toEqual({
      baseType: "Stop",
      subType: null,
      cssClass: "status-badge--stop",
    });
  });

  it("parses compound event type with subtype", () => {
    const result = parseEventType("Notification:error");
    expect(result).toEqual({
      baseType: "Notification",
      subType: "error",
      cssClass: "status-badge--notification",
    });
  });

  it("handles SessionStart", () => {
    const result = parseEventType("SessionStart");
    expect(result).toEqual({
      baseType: "SessionStart",
      subType: null,
      cssClass: "status-badge--sessionstart",
    });
  });

  it("handles SubagentStop", () => {
    const result = parseEventType("SubagentStop");
    expect(result).toEqual({
      baseType: "SubagentStop",
      subType: null,
      cssClass: "status-badge--subagentstop",
    });
  });
});

describe("isAiSummary", () => {
  it("returns false for default summary 'Task completed'", () => {
    expect(isAiSummary("Task completed")).toBe(false);
  });

  it("returns false for default summary 'Waiting for input'", () => {
    expect(isAiSummary("Waiting for input")).toBe(false);
  });

  it("returns true for custom summary", () => {
    expect(isAiSummary("Implementing feature X with tests")).toBe(true);
  });

  it("returns true for similar but not exact default summary", () => {
    expect(isAiSummary("Task completed successfully")).toBe(true);
  });
});
