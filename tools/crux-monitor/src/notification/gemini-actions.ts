import type { PaneAction } from "../../shared/types";
import {
  deleteInflightRequest,
  getCachedAction,
  getInflightRequest,
  setCachedAction,
  setInflightRequest,
} from "./action-cache";
import { getGcpLocation, getGcpProject } from "./config";
import { type FetchFn, getAccessToken } from "./gemini";

const MODEL_ID = "gemini-2.5-flash";
const ACTION_TAIL_CHARS = 1000;

const DEFAULT_ACTION: PaneAction = { type: "none" };

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Dependencies that can be injected for testing
 */
export interface ActionDeps {
  fetch: FetchFn;
  getAccessToken: () => string | null;
  getGcpProject: () => string | null;
  getGcpLocation: () => string;
}

/**
 * Get the tail of pane content, limited by character count
 */
export function getContentTail(content: string): string {
  if (content.length <= ACTION_TAIL_CHARS) return content;
  return content.slice(-ACTION_TAIL_CHARS);
}

/**
 * Build the prompt for Gemini to detect what interaction the terminal expects.
 */
export function buildActionPrompt(contentTail: string): string {
  return `Analyze the following terminal output from a Claude Code session.
Determine what type of user interaction is expected based on the last visible prompt or question.

Rules (apply in this priority order):
1. If the terminal shows a numbered list of options (e.g., "1. Option A", "2. Option B"), return type "choices". Use the number as the value and a short label for each. This rule takes priority — any numbered list is always "choices". IMPORTANT: Only include options that appear ABOVE the horizontal separator line (─────). Exclude any options below the separator such as "Chat about this" — those cannot be selected by number key.
2. If the terminal shows a Yes/No permission prompt (e.g., "Do you want to proceed?" with Yes/No options), return type "yesno".
3. If the terminal is waiting for free-form text input with NO numbered options (e.g., a standalone prompt asking for a name, path, or description), return type "freeform" with an appropriate placeholder.
4. If no interactive prompt is detected (e.g., the process is still running, just completed output, or showing a status report), return type "none".

autoEnter field for choices:
- Each option has an "autoEnter" boolean. Set to true for options that are complete selections (e.g., "1. Mango" — selecting it is the final action). Set to false for options that require further user input after selection (e.g., "Type something" or any option that opens a text input).

Claude Code UI patterns to recognize:
1. AskUserQuestion with numbered choices — bordered region with header, question text, numbered options (1. Option, 2. Option...), sometimes with a cursor, footer "Enter to select / to navigate / Esc to cancel". Options below the separator line (like "Chat about this") should be EXCLUDED.
2. Permission/confirmation prompt — "Do you want to proceed?" with Yes/No options and footer "Esc to cancel / Tab to amend"

Return ONLY valid JSON matching one of these schemas:
{"type":"choices","options":[{"label":"1. Mango","value":"1","autoEnter":true},{"label":"2. Strawberry","value":"2","autoEnter":true},{"label":"3. Type something","value":"3","autoEnter":false}]}
{"type":"yesno"}
{"type":"freeform","placeholder":"Enter your response..."}
{"type":"none"}

Terminal output:
${contentTail}`;
}

const VALID_ACTION_TYPES = new Set(["choices", "yesno", "freeform", "none"]);

/**
 * Validate that a parsed object is a valid PaneAction.
 */
function isValidPaneAction(parsed: unknown): parsed is PaneAction {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.type !== "string") return false;
  return VALID_ACTION_TYPES.has(obj.type);
}

/**
 * Detect what pane action the terminal expects using the Gemini API.
 * Supports dependency injection for testing via the deps parameter.
 */
export async function detectPaneActions(
  content: string,
  deps?: Partial<ActionDeps>,
): Promise<PaneAction> {
  const resolved: ActionDeps = {
    fetch: globalThis.fetch,
    getAccessToken,
    getGcpProject,
    getGcpLocation,
    ...deps,
  };

  if (!content.trim()) {
    return DEFAULT_ACTION;
  }

  const contentTail = getContentTail(content);

  // Check cache
  const cached = getCachedAction(contentTail);
  if (cached !== null) {
    console.log(
      `${new Date().toISOString()} [Gemini Actions] Cache hit (input: ${contentTail.length} chars)`,
    );
    return cached;
  }

  // Deduplicate concurrent requests for the same content
  const existing = getInflightRequest(contentTail);
  if (existing !== null) {
    console.log(
      `${new Date().toISOString()} [Gemini Actions] Dedup hit - awaiting in-flight request (input: ${contentTail.length} chars)`,
    );
    return existing;
  }

  const projectId = resolved.getGcpProject();
  if (!projectId) {
    return DEFAULT_ACTION;
  }

  const accessToken = resolved.getAccessToken();
  if (!accessToken) {
    return DEFAULT_ACTION;
  }

  const location = resolved.getGcpLocation();
  const apiUrl = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${MODEL_ID}:generateContent`;

  const prompt = buildActionPrompt(contentTail);

  const requestPromise = (async (): Promise<PaneAction> => {
    try {
      const startTime = Date.now();
      console.log(
        `${new Date().toISOString()} [Gemini Actions] Requesting action detection (input: ${contentTail.length} chars, prompt: ${prompt.length} chars)`,
      );
      console.log(`${new Date().toISOString()} [Gemini Actions] Content tail:\n${contentTail}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await resolved.fetch(apiUrl, {
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
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(
          `${new Date().toISOString()} [Gemini Actions] Request failed: HTTP ${response.status} (${Date.now() - startTime}ms)`,
        );
        return DEFAULT_ACTION;
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.log(
          `${new Date().toISOString()} [Gemini Actions] Empty response (${Date.now() - startTime}ms)`,
        );
        return DEFAULT_ACTION;
      }

      const parsed: unknown = JSON.parse(text);
      if (!isValidPaneAction(parsed)) {
        console.log(
          `${new Date().toISOString()} [Gemini Actions] Invalid action type (${Date.now() - startTime}ms)`,
        );
        return DEFAULT_ACTION;
      }

      console.log(
        `${new Date().toISOString()} [Gemini Actions] Action detected (${Date.now() - startTime}ms): ${parsed.type}`,
      );
      setCachedAction(contentTail, parsed);
      return parsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.log(`${new Date().toISOString()} [Gemini Actions] Request error: ${message}`);
      return DEFAULT_ACTION;
    }
  })();

  setInflightRequest(contentTail, requestPromise);
  try {
    return await requestPromise;
  } finally {
    deleteInflightRequest(contentTail);
  }
}
