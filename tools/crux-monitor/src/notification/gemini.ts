import { execSync } from "node:child_process";
import { getGcpLocation, getGcpProject } from "./config";

const MODEL_ID = "gemini-2.5-flash";
const MAX_SUMMARY_LENGTH = 100;
const CONVERSATION_TAIL_CHARS = 4000;

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
 * Get the tail of conversation text, limited by character count
 */
export function getConversationTail(conversation: string): string {
  if (conversation.length <= CONVERSATION_TAIL_CHARS) return conversation;
  return conversation.slice(-CONVERSATION_TAIL_CHARS);
}

/**
 * Build the prompt for Gemini to summarize a Claude Code session.
 * The content may be terminal pane output or a JSONL conversation extract.
 * Includes attention detection to prefix summaries with emoji when user action is needed.
 */
export function buildConversationPrompt(conversationTail: string): string {
  return `IMPORTANT: Analyze the content to determine what language the user is using. Your response MUST be in the same language as the user's messages.

The following is the terminal output from a Claude Code session. Claude appears to be idle.

Your task: determine whether Claude needs the user's attention, then write a short summary (15 words or less).

ATTENTION DETECTION — prefix with emoji when Claude is waiting for user action:
- Permission request (file delete, git push, command execution, tool use approval) → prefix with 🔔
- Question asking user to choose between options → prefix with 🙋
- Question asking for information or clarification → prefix with 🙋
- No user action needed (just completed work, status report) → NO emoji prefix

Examples:
- "🔔 Waiting for permission to delete 3 files"
- "🔔 Requesting approval to run git push"
- "🙋 Asking which database to use"
- "🙋 Needs clarification on auth method"
- "Completed refactoring auth module"
- "Tests passing, ready for next task"

Output ONLY the summary line, nothing else.

${conversationTail}`;
}

/**
 * Generate a summary from Claude Code conversation using the Gemini API.
 * The conversation parameter is extracted text from the session's JSONL file.
 * Supports dependency injection for testing via the deps parameter.
 */
export async function generatePaneSummary(
  conversation: string,
  deps?: GenerateSummaryDeps,
): Promise<string | null> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const getAccessTokenFn = deps?.getAccessTokenFn ?? getAccessToken;
  const getGcpProjectFn = deps?.getGcpProjectFn ?? getGcpProject;
  const getGcpLocationFn = deps?.getGcpLocationFn ?? getGcpLocation;

  if (!conversation.trim()) {
    return null;
  }

  const projectId = getGcpProjectFn();
  if (!projectId) {
    return null;
  }

  const accessToken = getAccessTokenFn();
  if (!accessToken) {
    return null;
  }

  const conversationTail = getConversationTail(conversation);
  const location = getGcpLocationFn();
  const apiUrl = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${MODEL_ID}:generateContent`;

  const prompt = buildConversationPrompt(conversationTail);

  try {
    const startTime = Date.now();
    console.log(`[Gemini] Requesting summary (input: ${conversationTail.length} chars)`);

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
      console.log(`[Gemini] Request failed: HTTP ${response.status} (${Date.now() - startTime}ms)`);
      return null;
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.log(`[Gemini] Empty response (${Date.now() - startTime}ms)`);
      return null;
    }

    const summary = text.slice(0, MAX_SUMMARY_LENGTH).trim();
    console.log(`[Gemini] Summary received (${Date.now() - startTime}ms): ${summary}`);
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.log(`[Gemini] Request error: ${message}`);
    return null;
  }
}
