/**
 * Shared types for Gemini API integration.
 */

/** Response shape from Gemini generateContent API */
export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}
