import { describe, expect, it } from "bun:test";
import { detectSpinner, detectUserPrompt } from "./detect";

describe("detectSpinner", () => {
  it("detects spinner character at start of line", () => {
    expect(detectSpinner("some output\n\u273d Thinking...\n")).toBe(true);
  });

  it("detects each spinner character variant", () => {
    for (const char of ["\u273d", "\u273b", "\u2736", "\u00b7", "\u2722"]) {
      expect(detectSpinner(`output\n${char} Processing\n`)).toBe(true);
    }
  });

  it("detects spinner with status text like 'Cooked for Xs'", () => {
    expect(detectSpinner("output\n\u273b Cooked for 31s\n")).toBe(true);
  });

  it("detects bare spinner character without status text", () => {
    expect(detectSpinner("output\n\u273d\n")).toBe(true);
  });

  it("returns false when no spinner present", () => {
    expect(detectSpinner("$ echo hello\nhello\n")).toBe(false);
  });

  it("returns false for empty content", () => {
    expect(detectSpinner("")).toBe(false);
  });

  it("returns false for whitespace-only content", () => {
    expect(detectSpinner("   \n  \n")).toBe(false);
  });

  it("does not match spinner characters in middle of text", () => {
    expect(detectSpinner("some text with \u273d in the middle\n")).toBe(false);
  });

  it("handles leading whitespace before spinner", () => {
    expect(detectSpinner("output\n  \u273d Thinking...\n")).toBe(true);
  });

  it("detects spinner within last 5 non-empty lines", () => {
    const content = "line1\nline2\n\u273d Working\nline4\nline5\nline6\n";
    expect(detectSpinner(content)).toBe(true);
  });

  it("does not detect spinner beyond last 5 non-empty lines", () => {
    const content = "\u273d Working\nline2\nline3\nline4\nline5\nline6\n";
    expect(detectSpinner(content)).toBe(false);
  });

  it("skips empty lines when counting last lines", () => {
    const content = "\u273d Working\n\n\nline2\nline3\nline4\nline5\nline6\n";
    expect(detectSpinner(content)).toBe(false);
  });
});

describe("detectUserPrompt", () => {
  it("detects empty prompt '> '", () => {
    expect(detectUserPrompt("some output\n> \n")).toBe(true);
  });

  it("detects bare '>' without trailing space", () => {
    expect(detectUserPrompt("some output\n>\n")).toBe(true);
  });

  it("detects prompt with user text as last line", () => {
    expect(detectUserPrompt("output\n> help me fix this bug")).toBe(true);
  });

  it("returns false when no prompt present", () => {
    expect(detectUserPrompt("\u273d Thinking...\nprocessing\n")).toBe(false);
  });

  it("returns false for empty content", () => {
    expect(detectUserPrompt("")).toBe(false);
  });

  it("returns false for whitespace-only content", () => {
    expect(detectUserPrompt("   \n  \n")).toBe(false);
  });

  it("does not match > in middle of line", () => {
    expect(detectUserPrompt("redirect output > file.txt\n")).toBe(false);
  });

  it("detects prompt with leading whitespace", () => {
    expect(detectUserPrompt("output\n  > some text\n")).toBe(true);
  });

  it("detects prompt as last non-empty line", () => {
    const content = "line1\nline2\n> prompt\n";
    expect(detectUserPrompt(content)).toBe(true);
  });

  it("does not match prompt that is not the last non-empty line", () => {
    const content = "> prompt\nsome other output\n";
    expect(detectUserPrompt(content)).toBe(false);
  });

  it("does not match past user input in conversation history", () => {
    const content = "$ claude\n> Fix the bug\nDone. Waiting for input.\n";
    expect(detectUserPrompt(content)).toBe(false);
  });
});
