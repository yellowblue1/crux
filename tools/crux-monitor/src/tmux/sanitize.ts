/**
 * Sanitization utilities for terminal pane content.
 * Strips Claude Code prompt area, suggestion artifacts, and ANSI escape sequences
 * before content is used for state detection or sent to the Gemini API.
 */

/** How many lines from the bottom to scan for the prompt area */
const PROMPT_SCAN_LINES = 20;

/** Max lines to search backwards from ❯ for the top border */
const BORDER_SEARCH_RANGE = 5;

/**
 * Check if a line is a prompt border.
 * Matches:
 * - ╭ (U+256D) — box-drawing arc corner (older or alternative prompt style)
 * - 10+ consecutive ─ (U+2500) — solid horizontal line (current Claude Code prompt)
 * Does NOT match:
 * - ╌ (U+254C) — dashed horizontal line (used in selection/diff UIs)
 */
const SOLID_BORDER_RE = /─{10,}/;

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
 * Claude Code renders an input area at the bottom of the terminal in two styles:
 *
 * Style 1 (box-drawing):
 *   ╭───────────────────────────╮
 *   │ ❯ user input [suggestion] │
 *   ╰───────────────────────────╯
 *   status bar...
 *
 * Style 2 (solid horizontal lines):
 *   ──────────────── @session ──
 *   ❯ user input
 *   ───────────────────────────
 *   status bar...
 *
 * This function finds the prompt by looking for BOTH the ❯ (U+276F) prompt
 * marker AND a top border (╭ or ─{10,}) within a few lines above it.
 * This avoids stripping selection UIs where ❯ appears as a selection
 * indicator (those use ╌ dashed lines, not solid ─ lines).
 * Returns content unchanged if no bordered prompt area is found.
 */
export function stripPromptArea(content: string): string {
  const lines = content.split("\n");
  const scanStart = Math.max(0, lines.length - PROMPT_SCAN_LINES);

  // Scan from bottom for the ❯ prompt marker
  for (let i = lines.length - 1; i >= scanStart; i--) {
    if (!lines[i].includes("❯")) continue;

    // Found prompt marker — look backwards (limited range) for the top border.
    // Matches ╭ (box-drawing corner) or ─{10,} (solid horizontal line).
    // Limited to BORDER_SEARCH_RANGE lines above ❯ to avoid matching
    // ─ lines in diff displays or other content higher up.
    const borderSearchStart = Math.max(scanStart, i - BORDER_SEARCH_RANGE);
    for (let j = i - 1; j >= borderSearchStart; j--) {
      if (lines[j].includes("╭") || SOLID_BORDER_RE.test(lines[j])) {
        return lines.slice(0, j).join("\n").trimEnd();
      }
    }

    // No border found nearby — this ❯ is a selection indicator, not the input prompt.
    // Continue scanning for another ❯ higher up (unlikely but safe).
  }

  // No bordered prompt area found — return as-is
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
