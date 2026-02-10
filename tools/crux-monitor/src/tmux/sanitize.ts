/**
 * Sanitization utilities for terminal pane content.
 * Strips Claude Code prompt area, suggestion artifacts, and ANSI escape sequences
 * before content is used for state detection or sent to the Gemini API.
 */

/** How many lines from the bottom to scan for the prompt area */
const PROMPT_SCAN_LINES = 20;

// Build ESC-based regex patterns from strings to satisfy the
// noControlCharactersInRegex lint rule (the control chars are intentional here).
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

/** Matches dim/faint text: ESC[2m ... ESC[22m or ESC[0m or ESC[m */
const DIM_TEXT_RE = new RegExp(`${ESC}\\[2m[\\s\\S]*?${ESC}\\[(?:22|0)?m`, "g");

/** Matches all ANSI escape sequences: CSI, OSC, two-byte ESC */
const ANSI_RE = new RegExp(
  `${ESC}(?:\\[[0-9;]*[A-Za-z]|\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|[()][0-9A-Za-z]|[A-Z])`,
  "g",
);

/**
 * Strip the Claude Code prompt input area from captured pane content.
 * Claude Code renders an input box at the bottom of the terminal:
 *
 *   ╭───────────────────────────╮
 *   │ ❯ user input [suggestion] │
 *   ╰───────────────────────────╯
 *   status bar...
 *
 * This function finds the input box by looking for the ❯ (U+276F) prompt
 * marker in the last N lines, then strips everything from the top border
 * (╭) downward. Returns content unchanged if no prompt area is found.
 */
export function stripPromptArea(content: string): string {
  const lines = content.split("\n");
  const scanStart = Math.max(0, lines.length - PROMPT_SCAN_LINES);

  // Scan from bottom for the ❯ prompt marker
  for (let i = lines.length - 1; i >= scanStart; i--) {
    if (!lines[i].includes("❯")) continue;

    // Found prompt marker — look backwards for the top border (╭)
    let stripFrom = i;
    for (let j = i - 1; j >= scanStart; j--) {
      if (lines[j].includes("╭")) {
        stripFrom = j;
        break;
      }
    }

    return lines.slice(0, stripFrom).join("\n").trimEnd();
  }

  // No prompt area found — return as-is
  return content;
}

/**
 * Strip text rendered with ANSI SGR dim/faint attribute (code 2).
 * Terminal suggestions from Claude Code are rendered as dim ghost text:
 *   ESC[2m<suggestion>ESC[22m  (dim on / normal intensity)
 *   ESC[2m<suggestion>ESC[0m   (dim on / reset all)
 *   ESC[2m<suggestion>ESC[m    (dim on / shorthand reset)
 */
export function stripDimText(input: string): string {
  return input.replace(DIM_TEXT_RE, "");
}

/**
 * Strip all ANSI escape sequences from content.
 * Handles CSI sequences (ESC[...X), OSC sequences (ESC]...BEL/ST),
 * and two-byte ESC sequences.
 */
export function stripAnsiEscapes(input: string): string {
  return input.replace(ANSI_RE, "");
}

/**
 * Full sanitization pipeline for pane content before Gemini submission.
 * Accepts ANSI-escaped content (from `tmux capture-pane -p -e`).
 *
 * Pipeline:
 * 1. Strip dim/faint text (suggestion ghost text, needs ANSI codes)
 * 2. Strip remaining ANSI escape sequences
 * 3. Strip the Claude Code prompt input area
 * 4. Collapse runs of spaces left by removed inline content
 */
export function sanitizePaneContent(input: string): string {
  const noDim = stripDimText(input);
  const noAnsi = stripAnsiEscapes(noDim);
  const noPrompt = stripPromptArea(noAnsi);
  return noPrompt.replace(/ {2,}/g, " ");
}
