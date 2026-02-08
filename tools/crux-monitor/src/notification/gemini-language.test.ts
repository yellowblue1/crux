import { describe, expect, it } from "bun:test";
import { getGcpLocation, getGcpProject } from "./config";
import { buildConversationPrompt, getAccessToken } from "./gemini";

// Integration tests - require GCP authentication
// Run with: INTEGRATION=true bun test gemini-language.test.ts
const runIntegration = process.env.INTEGRATION === "true";

const MODEL_ID = "gemini-2.5-flash";

// Sample conversation content (extracted from JSONL)
const JAPANESE_PANE_CONTENT = `[user]: プロジェクトのセットアップを手伝ってください。

[assistant]: I'll help you with the project setup.

Which database would you like to use?
1. PostgreSQL
2. MySQL
3. SQLite

データベースを選択してください。上の選択肢から番号を入力してください。`;

const ENGLISH_PANE_CONTENT = `[user]: Please refactor the auth module.

[assistant]: I've completed the refactoring of the auth module.

Changes made:
- Extracted JWT validation into middleware
- Added refresh token rotation
- Updated tests

Would you like me to create a PR for these changes?`;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

async function callGeminiWithPrompt(prompt: string): Promise<string | null> {
  const projectId = getGcpProject();
  if (!projectId) {
    throw new Error("GCP project not configured");
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Failed to get access token");
  }

  const location = getGcpLocation();
  const apiUrl = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${MODEL_ID}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(apiUrl, {
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
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

describe.skipIf(!runIntegration)("Gemini Language Detection - Integration", () => {
  it("should respond in Japanese for Japanese pane content", async () => {
    const prompt = buildConversationPrompt(JAPANESE_PANE_CONTENT);
    const result = await callGeminiWithPrompt(prompt);

    console.log("Japanese pane result:", result);

    if (result === null) {
      throw new Error("Expected non-null result from Gemini API");
    }
    expect(containsJapanese(result)).toBe(true);
  }, 20000);

  it("should respond in English for English pane content", async () => {
    const prompt = buildConversationPrompt(ENGLISH_PANE_CONTENT);
    const result = await callGeminiWithPrompt(prompt);

    console.log("English pane result:", result);

    if (result === null) {
      throw new Error("Expected non-null result from Gemini API");
    }
    expect(containsJapanese(result)).toBe(false);
  }, 20000);
});
