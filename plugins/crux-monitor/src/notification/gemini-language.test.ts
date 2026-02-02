import { describe, expect, it } from "bun:test";
import { getGcpLocation, getGcpProject } from "./config";
import { buildPrompt, getAccessToken } from "./gemini";

// Integration tests - require GCP authentication
// Run with: INTEGRATION=true bun test gemini-language.test.ts
const runIntegration = process.env.INTEGRATION === "true";

const MODEL_ID = "gemini-2.5-flash";

// Sample transcripts
const JAPANESE_TRANSCRIPT = `{"type":"user","message":{"role":"user","content":"今このディレクトリにPDFがあるのがわかると思う。bunでプロジェクトを立ち上げる"}}
{"type":"assistant","message":{"role":"assistant","content":"PDFファイルを確認して、bunプロジェクトを立ち上げます。"}}
{"type":"tool_use","tool":"Bash","input":{"command":"ls -la *.pdf"}}
{"type":"tool_result","output":"sample.pdf"}
{"type":"assistant","message":{"role":"assistant","content":"PDFファイルを確認しました。bunプロジェクトを初期化します。"}}`;

const ENGLISH_TRANSCRIPT = `{"type":"user","message":{"role":"user","content":"I want to create a new React component for the dashboard"}}
{"type":"assistant","message":{"role":"assistant","content":"I'll help you create a new React component for the dashboard."}}
{"type":"tool_use","tool":"Write","input":{"path":"src/components/Dashboard.tsx"}}
{"type":"tool_result","output":"File created"}
{"type":"assistant","message":{"role":"assistant","content":"I've created the Dashboard component. Let me add the styling next."}}`;

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
 * Call Gemini API directly with a prompt
 */
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

/**
 * Check if text contains Japanese characters
 */
function containsJapanese(text: string): boolean {
  // Hiragana, Katakana, or Kanji
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

describe.skipIf(!runIntegration)("Gemini Language Detection - Integration", () => {
  it("should respond in Japanese for Japanese transcript", async () => {
    const prompt = buildPrompt(JAPANESE_TRANSCRIPT, "stop");
    const result = await callGeminiWithPrompt(prompt);

    console.log("Japanese transcript result:", result);

    if (result === null) {
      throw new Error("Expected non-null result from Gemini API");
    }
    expect(containsJapanese(result)).toBe(true);
  }, 20000);

  it("should respond in English for English transcript", async () => {
    const prompt = buildPrompt(ENGLISH_TRANSCRIPT, "stop");
    const result = await callGeminiWithPrompt(prompt);

    console.log("English transcript result:", result);

    if (result === null) {
      throw new Error("Expected non-null result from Gemini API");
    }
    expect(containsJapanese(result)).toBe(false);
  }, 20000);
});
