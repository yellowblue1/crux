import { describe, expect, it } from "bun:test";
import { sanitizePaneContent, stripAnsiEscapes, stripDimText } from "./sanitize";

const ESC = "\x1b";

describe("stripDimText", () => {
  it("removes basic dim text", () => {
    const input = `visible ${ESC}[2msuggestion${ESC}[22m after`;
    expect(stripDimText(input)).toBe("visible  after");
  });

  it("removes dim text terminated by reset (ESC[0m)", () => {
    const input = `before ${ESC}[2mghost${ESC}[0m after`;
    expect(stripDimText(input)).toBe("before  after");
  });

  it("removes dim text terminated by bare ESC[m", () => {
    const input = `before ${ESC}[2mghost${ESC}[m after`;
    expect(stripDimText(input)).toBe("before  after");
  });

  it("removes multiple dim blocks", () => {
    const input = `a ${ESC}[2mx${ESC}[22m b ${ESC}[2my${ESC}[0m c`;
    expect(stripDimText(input)).toBe("a  b  c");
  });

  it("removes dim block with nested ANSI codes inside", () => {
    const input = `start ${ESC}[2m${ESC}[33myellow dim${ESC}[39m${ESC}[22m end`;
    expect(stripDimText(input)).toBe("start  end");
  });

  it("passes through text with no dim sequences", () => {
    const input = "just plain text";
    expect(stripDimText(input)).toBe("just plain text");
  });

  it("removes dim text at end of line", () => {
    const input = `prompt> ${ESC}[2msuggestion${ESC}[22m`;
    expect(stripDimText(input)).toBe("prompt> ");
  });

  it("handles multiline dim blocks", () => {
    const input = `line1\n${ESC}[2mfaint\ntext${ESC}[22m\nline3`;
    expect(stripDimText(input)).toBe("line1\n\nline3");
  });
});

describe("stripAnsiEscapes", () => {
  it("strips color codes", () => {
    const input = `${ESC}[32mgreen${ESC}[0m text`;
    expect(stripAnsiEscapes(input)).toBe("green text");
  });

  it("strips bold and underline", () => {
    const input = `${ESC}[1mbold${ESC}[22m ${ESC}[4munderline${ESC}[24m`;
    expect(stripAnsiEscapes(input)).toBe("bold underline");
  });

  it("strips cursor movement sequences", () => {
    const input = `${ESC}[10Ahello${ESC}[5B`;
    expect(stripAnsiEscapes(input)).toBe("hello");
  });

  it("passes through plain text", () => {
    const input = "no escapes here";
    expect(stripAnsiEscapes(input)).toBe("no escapes here");
  });

  it("strips multiple CSI sequences in a row", () => {
    const input = `${ESC}[1m${ESC}[33m${ESC}[44mstyle${ESC}[0m`;
    expect(stripAnsiEscapes(input)).toBe("style");
  });
});

describe("sanitizePaneContent", () => {
  it("runs full pipeline: strip dim, strip ANSI, collapse spaces", () => {
    const input = `${ESC}[1mBold${ESC}[22m visible ${ESC}[2msuggestion${ESC}[22m text`;
    const result = sanitizePaneContent(input);
    expect(result).toBe("Bold visible text");
  });

  it("handles realistic Claude Code suggestion scenario", () => {
    const input = [
      `${ESC}[1m❯${ESC}[22m ${ESC}[32mbun test${ESC}[0m`,
      `${ESC}[2m --cwd tools/crux-monitor${ESC}[22m`,
      "PASS src/tmux/utils.test.ts",
    ].join("\n");
    const result = sanitizePaneContent(input);
    expect(result).toBe("❯ bun test\n\nPASS src/tmux/utils.test.ts");
  });

  it("collapses double spaces left by removal", () => {
    const input = `word1  ${ESC}[2mghost${ESC}[22m  word2`;
    const result = sanitizePaneContent(input);
    expect(result).toBe("word1 word2");
  });

  it("passes through plain text unchanged", () => {
    expect(sanitizePaneContent("hello world")).toBe("hello world");
  });
});
