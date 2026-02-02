import { afterEach, describe, expect, it } from "bun:test";
import {
  cleanupAll,
  createFile,
  createTempDir,
  mockFetchNetworkError,
  mockGeminiEmpty,
  mockGeminiError,
  mockGeminiSuccess,
  SAMPLE_TRANSCRIPTS,
} from "../__tests__";
import { buildPrompt, generateSummary, readTranscriptTail } from "./gemini";

describe("gemini", () => {
  afterEach(() => {
    cleanupAll();
  });

  describe("buildPrompt", () => {
    it("should include language instruction in all prompts", () => {
      const prompt = buildPrompt("test content", "stop");
      expect(prompt).toContain("IMPORTANT: Analyze the user's messages");
      expect(prompt).toContain("Your response MUST be in the same language");
    });

    it("should build stop event prompt with completion focus", () => {
      const prompt = buildPrompt("test content", "stop");
      expect(prompt).toContain("Summarize what was completed or accomplished");
      expect(prompt).toContain("Fixed login bug");
      expect(prompt).toContain("test content");
    });

    it("should build notification event prompt with question focus", () => {
      const prompt = buildPrompt("test content", "notification");
      expect(prompt).toContain("Claude is waiting for user input");
      expect(prompt).toContain("AskUserQuestion");
      expect(prompt).toContain("Asking which database to use");
      expect(prompt).toContain("test content");
    });

    it("should include transcript content at the end", () => {
      const transcript = "line1\nline2\nline3";
      const prompt = buildPrompt(transcript, "stop");
      expect(prompt.endsWith(transcript)).toBe(true);
    });
  });

  describe("readTranscriptTail", () => {
    it("should return null for empty path", () => {
      expect(readTranscriptTail("")).toBeNull();
    });

    it("should return null for non-existent file", () => {
      expect(readTranscriptTail("/non/existent/path.jsonl")).toBeNull();
    });

    it("should read file content", () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = readTranscriptTail(filePath);
      expect(result).not.toBeNull();
      expect(result).toContain("React component");
    });

    it("should return last 50 lines for long files", () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "long.jsonl", SAMPLE_TRANSCRIPTS.long);

      const result = readTranscriptTail(filePath);
      expect(result).not.toBeNull();

      const lines = result?.split("\n") ?? [];
      expect(lines.length).toBe(50);
      // Should have lines 51-100 (last 50 lines)
      expect(lines[0]).toContain("Line 51");
      expect(lines[49]).toContain("Line 100");
    });

    it("should handle files with fewer than 50 lines", () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "short.jsonl", SAMPLE_TRANSCRIPTS.minimal);

      const result = readTranscriptTail(filePath);
      expect(result).not.toBeNull();
      expect(result).toContain("Hello");
    });
  });

  describe("generateSummary", () => {
    type FetchFn = (url: string | URL | Request, options?: RequestInit) => Promise<Response>;

    const mockDeps = (fetchFn: FetchFn) => ({
      fetchFn,
      getAccessTokenFn: () => "mock-token",
      getGcpProjectFn: () => "mock-project",
      getGcpLocationFn: () => "us-central1",
    });

    it("should return summary on successful API response", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = await generateSummary(
        filePath,
        "stop",
        mockDeps(mockGeminiSuccess("Created Dashboard component")),
      );

      expect(result).toBe("Created Dashboard component");
    });

    it("should return null when project is not configured", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = await generateSummary(filePath, "stop", {
        ...mockDeps(mockGeminiSuccess("test")),
        getGcpProjectFn: () => null,
      });

      expect(result).toBeNull();
    });

    it("should return null when transcript file is missing", async () => {
      const result = await generateSummary(
        "/non/existent/file.jsonl",
        "stop",
        mockDeps(mockGeminiSuccess("test")),
      );

      expect(result).toBeNull();
    });

    it("should return null when access token is unavailable", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = await generateSummary(filePath, "stop", {
        ...mockDeps(mockGeminiSuccess("test")),
        getAccessTokenFn: () => null,
      });

      expect(result).toBeNull();
    });

    it("should return null on API error response", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = await generateSummary(filePath, "stop", mockDeps(mockGeminiError(500)));

      expect(result).toBeNull();
    });

    it("should return null on empty candidates", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = await generateSummary(filePath, "stop", mockDeps(mockGeminiEmpty()));

      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = await generateSummary(filePath, "stop", mockDeps(mockFetchNetworkError()));

      expect(result).toBeNull();
    });

    it("should truncate long summaries to 100 characters", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const longSummary = "A".repeat(150);
      const result = await generateSummary(
        filePath,
        "stop",
        mockDeps(mockGeminiSuccess(longSummary)),
      );

      expect(result).not.toBeNull();
      expect(result?.length).toBe(100);
    });

    it("should trim whitespace from summary", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.english);

      const result = await generateSummary(
        filePath,
        "stop",
        mockDeps(mockGeminiSuccess("  Summary with spaces  ")),
      );

      expect(result).toBe("Summary with spaces");
    });

    it("should use notification prompt for notification event type", async () => {
      const dir = createTempDir("transcript");
      const filePath = createFile(dir, "test.jsonl", SAMPLE_TRANSCRIPTS.askUserQuestion);

      let capturedBody: string | undefined;
      const capturingFetch = async (
        url: string | URL | Request,
        options?: RequestInit,
      ): Promise<Response> => {
        capturedBody = options?.body as string;
        return mockGeminiSuccess("Asking about database choice")(url, options);
      };

      await generateSummary(filePath, "notification", mockDeps(capturingFetch));

      expect(capturedBody).toBeDefined();
      expect(capturedBody).toContain("Claude is waiting for user input");
    });
  });
});
