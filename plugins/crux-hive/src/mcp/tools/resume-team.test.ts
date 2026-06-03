import { describe, expect, it } from "bun:test";
import { formatResult, resumeTeamSession } from "./resume-team.js";

describe("resumeTeamSession", () => {
  it("should return an error when teamName is missing", async () => {
    const result = await resumeTeamSession({ teamName: "" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining("teamName") });
  });
});

describe("formatResult", () => {
  it("should summarize resumed workers", () => {
    const text = formatResult({ resumed: ["a", "b"], skipped: [], failed: [] });
    expect(text).toContain("Resumed 2 worker(s).");
    expect(text).toContain("resumed: a, b");
  });

  it("should list skipped workers with reasons", () => {
    const text = formatResult({
      resumed: [],
      skipped: [{ name: "old", reason: "no-session-id" }],
      failed: [],
    });
    expect(text).toContain("skipped:");
    expect(text).toContain("- old (no-session-id)");
  });

  it("should list failed workers with errors", () => {
    const text = formatResult({
      resumed: [],
      skipped: [],
      failed: [{ name: "w", error: "boom" }],
    });
    expect(text).toContain("failed:");
    expect(text).toContain("- w: boom");
  });
});
