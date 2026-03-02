import { describe, expect, it } from "bun:test";
import { isShellPromptVisible } from "./tmux-adapter.js";

describe("isShellPromptVisible", () => {
  it("should detect bash prompt ($)", () => {
    expect(isShellPromptVisible("user@host:~$ ")).toBe(true);
  });

  it("should detect zsh prompt (%)", () => {
    expect(isShellPromptVisible("user@host ~ % ")).toBe(true);
  });

  it("should detect starship prompt (❯)", () => {
    expect(isShellPromptVisible("~/project\n❯ ")).toBe(true);
  });

  it("should detect root prompt (#)", () => {
    expect(isShellPromptVisible("root@host:/# ")).toBe(true);
  });

  it("should detect angle bracket prompt (>)", () => {
    expect(isShellPromptVisible("> ")).toBe(true);
  });

  it("should detect prompt without trailing space", () => {
    expect(isShellPromptVisible("user@host:~$")).toBe(true);
  });

  it("should not match empty content", () => {
    expect(isShellPromptVisible("")).toBe(false);
  });

  it("should not match whitespace-only content", () => {
    expect(isShellPromptVisible("   \n  \n  ")).toBe(false);
  });

  it("should not match loading message", () => {
    expect(isShellPromptVisible("Loading oh-my-zsh plugins...")).toBe(false);
  });

  it("should check only the last non-empty line", () => {
    const content = "Welcome to Ubuntu 22.04\nLast login: Mon Mar 2\nuser@host:~$ ";
    expect(isShellPromptVisible(content)).toBe(true);
  });

  it("should not match $ in middle of output when last line has no prompt", () => {
    const content = "Price is $100\nLoading...";
    expect(isShellPromptVisible(content)).toBe(false);
  });

  it("should handle multi-line prompt with indicator on last line", () => {
    const content = "┌──(user@host)-[~/project]\n└─$ ";
    expect(isShellPromptVisible(content)).toBe(true);
  });

  it("should ignore trailing blank lines", () => {
    const content = "user@host:~$ \n\n\n";
    expect(isShellPromptVisible(content)).toBe(true);
  });
});
