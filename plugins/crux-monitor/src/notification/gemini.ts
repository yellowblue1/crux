import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { getGcpLocation, getGcpProject } from "./config";

const MODEL_ID = "gemini-2.5-flash";
const MAX_SUMMARY_LENGTH = 100;
const TRANSCRIPT_LINES = 50;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

type FetchFn = (url: string | URL | Request, options?: RequestInit) => Promise<Response>;

/**
 * Dependencies that can be injected for testing
 */
export interface GenerateSummaryDeps {
  fetchFn?: FetchFn;
  getAccessTokenFn?: () => string | null;
  getGcpProjectFn?: () => string | null;
  getGcpLocationFn?: () => string;
}

/**
 * Get gcloud access token for API authentication
 */
export function getAccessToken(): string | null {
  try {
    return (
      execSync("gcloud auth print-access-token", {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * Read the last N lines of a transcript file
 */
export function readTranscriptTail(transcriptPath: string): string | null {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return null;
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n");
    return lines.slice(-TRANSCRIPT_LINES).join("\n");
  } catch {
    return null;
  }
}

/**
 * Build the prompt for Gemini based on event type
 */
export function buildPrompt(transcriptTail: string, eventType: string): string {
  const languageInstruction = `IMPORTANT: Analyze the user's messages in this transcript to determine what language they are using. Your response MUST be in the same language as the user's messages.

`;

  if (eventType === "notification") {
    return `${languageInstruction}The following is the end of Claude Code's transcript (JSONL format).
Claude is waiting for user input. Look for "AskUserQuestion" tool_use to understand what is being asked.
Summarize what question or input Claude is waiting for in 15 words or less.
Examples: "Asking which database to use", "Waiting for confirmation to proceed"
Output only the summary.

${transcriptTail}`;
  }

  return `${languageInstruction}The following is the end of Claude Code's transcript (JSONL format).
Summarize what was completed or accomplished in 15 words or less.
Examples: "Fixed login bug", "Created PR for feature X", "Refactored auth module"
Output only the summary.

${transcriptTail}`;
}

/**
 * Generate a summary using the Gemini API
 * Supports dependency injection for testing via the deps parameter
 */
export async function generateSummary(
  transcriptPath: string,
  eventType: string = "stop",
  deps?: GenerateSummaryDeps,
): Promise<string | null> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const getAccessTokenFn = deps?.getAccessTokenFn ?? getAccessToken;
  const getGcpProjectFn = deps?.getGcpProjectFn ?? getGcpProject;
  const getGcpLocationFn = deps?.getGcpLocationFn ?? getGcpLocation;

  const projectId = getGcpProjectFn();
  if (!projectId) {
    return null;
  }

  const transcriptTail = readTranscriptTail(transcriptPath);
  if (!transcriptTail) {
    return null;
  }

  const accessToken = getAccessTokenFn();
  if (!accessToken) {
    return null;
  }

  const location = getGcpLocationFn();
  const apiUrl = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${MODEL_ID}:generateContent`;

  const prompt = buildPrompt(transcriptTail, eventType);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetchFn(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: {
          role: "user",
          parts: { text: prompt },
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return null;
    }

    // Truncate to max length
    return text.slice(0, MAX_SUMMARY_LENGTH).trim();
  } catch {
    return null;
  }
}
