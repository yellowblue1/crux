import { describe, expect, it } from "bun:test";

describe("MSW unhandled request guard", () => {
  it("rejects unhandled network requests", async () => {
    expect(fetch("https://example.com")).rejects.toThrow(/\[MSW\]/);
  });
});
