import { describe, expect, it } from "bun:test";
import { encodeCwd, getTranscriptPath } from "./paths.js";

describe("encodeCwd", () => {
  it("should replace slashes with hyphens", () => {
    expect(encodeCwd("/home/u/proj")).toBe("-home-u-proj");
  });

  it("should replace dots and underscores with hyphens", () => {
    // Verified against the real CLI: /tmp/enc.test_dir -> -tmp-enc-test-dir
    expect(encodeCwd("/tmp/enc.test_dir")).toBe("-tmp-enc-test-dir");
  });

  it("should keep alphanumerics", () => {
    expect(encodeCwd("/a/b1/c2")).toBe("-a-b1-c2");
  });
});

describe("getTranscriptPath", () => {
  it("should build the projects transcript path from cwd and sessionId", () => {
    const p = getTranscriptPath("/home/u/proj", "sess-123");
    expect(p).toContain("/.claude/projects/-home-u-proj/sess-123.jsonl");
  });
});
