/**
 * Spinner characters used by Claude Code's thinking indicator.
 * These Unicode characters rotate in the terminal while Claude is processing.
 */
const SPINNER_CHARS = ["\u273d", "\u273b", "\u2736", "\u00b7", "\u2722"];

/**
 * Number of trailing non-empty lines to check for spinner presence.
 * The spinner status line is typically near the bottom of the terminal.
 */
const SPINNER_SCAN_LINES = 5;

/**
 * Number of trailing non-empty lines to check for user prompt.
 * Only check the very last non-empty line — Claude Code's active
 * prompt is always at the bottom of the terminal. Checking more
 * lines would false-match past user inputs shown in conversation history.
 */
const PROMPT_SCAN_LINES = 1;

/**
 * Detect whether Claude Code's thinking spinner is visible in pane content.
 *
 * Checks the last few non-empty lines for lines that start with one of
 * Claude Code's spinner characters (✽ ✻ ✶ · ✢), optionally followed by
 * status text like "Thinking..." or "Cooked for 31s".
 *
 * @param content - Plain text pane content (ANSI already stripped by capture-pane)
 * @returns true if a spinner indicator is detected
 */
export function detectSpinner(content: string): boolean {
  const lines = content.split("\n");
  const lastLines = lines.filter((line) => line.trim().length > 0).slice(-SPINNER_SCAN_LINES);

  for (const line of lastLines) {
    const trimmed = line.trimStart();
    for (const char of SPINNER_CHARS) {
      if (trimmed.startsWith(char)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Detect whether Claude Code is showing a user input prompt.
 *
 * Claude Code displays a ">" prompt when waiting for user input.
 * This detects the prompt at the bottom of the pane, indicating
 * the user may be composing input (even if the pane is static).
 *
 * @param content - Plain text pane content (ANSI already stripped by capture-pane)
 * @returns true if a user input prompt is detected
 */
export function detectUserPrompt(content: string): boolean {
  const lines = content.split("\n");
  const lastLines = lines.filter((line) => line.trim().length > 0).slice(-PROMPT_SCAN_LINES);

  for (const line of lastLines) {
    const trimmed = line.trimStart();
    if (trimmed === ">" || /^>\s/.test(trimmed)) {
      return true;
    }
  }
  return false;
}
