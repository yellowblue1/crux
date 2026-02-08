import { describe, expect, it } from "bun:test";
import {
  mockFetchNetworkError,
  mockGeminiEmpty,
  mockGeminiError,
  mockGeminiSuccess,
} from "../__tests__";
import { buildConversationPrompt, generatePaneSummary, getConversationTail } from "./gemini";

describe("gemini", () => {
  describe("getConversationTail", () => {
    it("returns full content when under limit", () => {
      const content = "[user]: Hello\n\n[assistant]: Hi there!";
      const result = getConversationTail(content);
      expect(result).toBe(content);
    });

    it("truncates long content from the start", () => {
      const content = "A".repeat(5000);
      const result = getConversationTail(content);
      expect(result.length).toBe(4000);
      expect(result).toBe("A".repeat(4000));
    });

    it("handles empty content", () => {
      expect(getConversationTail("")).toBe("");
    });
  });

  describe("buildConversationPrompt", () => {
    it("includes language instruction", () => {
      const prompt = buildConversationPrompt("test content");
      expect(prompt).toContain("IMPORTANT: Analyze the messages");
      expect(prompt).toContain("Your response MUST be in the same language");
    });

    it("includes idle context", () => {
      const prompt = buildConversationPrompt("test content");
      expect(prompt).toContain("appears to be idle");
      expect(prompt).toContain("15 words or less");
    });

    it("includes the content at the end", () => {
      const content = "[user]: Help me fix a bug\n\n[assistant]: Done.";
      const prompt = buildConversationPrompt(content);
      expect(prompt.endsWith(content)).toBe(true);
    });

    it("mentions conversation context", () => {
      const prompt = buildConversationPrompt("test");
      expect(prompt).toContain("conversation from a Claude Code session");
    });
  });

  describe("generatePaneSummary", () => {
    type FetchFn = (url: string | URL | Request, options?: RequestInit) => Promise<Response>;

    const mockDeps = (fetchFn: FetchFn) => ({
      fetchFn,
      getAccessTokenFn: () => "mock-token",
      getGcpProjectFn: () => "mock-project",
      getGcpLocationFn: () => "us-central1",
    });

    it("returns summary on successful API response", async () => {
      const result = await generatePaneSummary(
        "[user]: Which database should we use?\n\n[assistant]: Let me help you decide.",
        mockDeps(mockGeminiSuccess("Asking which database to use")),
      );

      expect(result).toBe("Asking which database to use");
    });

    it("returns null for empty content", async () => {
      const result = await generatePaneSummary("   ", mockDeps(mockGeminiSuccess("test")));
      expect(result).toBeNull();
    });

    it("returns null when project is not configured", async () => {
      const result = await generatePaneSummary("content", {
        ...mockDeps(mockGeminiSuccess("test")),
        getGcpProjectFn: () => null,
      });
      expect(result).toBeNull();
    });

    it("returns null when access token is unavailable", async () => {
      const result = await generatePaneSummary("content", {
        ...mockDeps(mockGeminiSuccess("test")),
        getAccessTokenFn: () => null,
      });
      expect(result).toBeNull();
    });

    it("returns null on API error response", async () => {
      const result = await generatePaneSummary("content", mockDeps(mockGeminiError(500)));
      expect(result).toBeNull();
    });

    it("returns null on empty candidates", async () => {
      const result = await generatePaneSummary("content", mockDeps(mockGeminiEmpty()));
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      const result = await generatePaneSummary("content", mockDeps(mockFetchNetworkError()));
      expect(result).toBeNull();
    });

    it("truncates long summaries to 100 characters", async () => {
      const longSummary = "A".repeat(150);
      const result = await generatePaneSummary("content", mockDeps(mockGeminiSuccess(longSummary)));

      expect(result).not.toBeNull();
      expect(result?.length).toBe(100);
    });

    it("trims whitespace from summary", async () => {
      const result = await generatePaneSummary(
        "content",
        mockDeps(mockGeminiSuccess("  Summary with spaces  ")),
      );
      expect(result).toBe("Summary with spaces");
    });
  });
});
