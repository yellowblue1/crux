/**
 * Sanitization utilities for terminal pane content.
 * Strips suggestion ghost text and ANSI escape sequences, while preserving
 * prompt area and interactive UI elements for Gemini to analyze.
 */

/** How many lines to skip from the bottom for state change detection */
const SKIP_BOTTOM_LINES = 10;

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
 * Skip the bottom N lines of content for state change detection.
 * The Claude Code prompt area (borders, input, status bar) lives at the
 * bottom of the terminal. Rather than pattern-matching specific Unicode
 * characters, we simply ignore the bottom lines when comparing content
 * for WAITING → BUSY transitions.
 */
export function skipBottomLines(content: string): string {
  const lines = content.split("\n");
  const keepCount = Math.max(1, lines.length - SKIP_BOTTOM_LINES);
  return lines.slice(0, keepCount).join("\n");
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
 * Sanitization pipeline for pane content before Gemini submission.
 * Accepts ANSI-escaped content (from `tmux capture-pane -p -e`).
 *
 * Strips only rendering noise (suggestions, ANSI codes) while preserving
 * prompt area and interactive UI elements — Gemini needs to see these
 * to detect attention-needed states and interactive elements.
 *
 * Pipeline:
 * 1. Strip dim/faint text (suggestion ghost text, needs ANSI codes)
 * 2. Strip remaining ANSI escape sequences
 * 3. Collapse runs of spaces left by removed inline content
 */
export function sanitizePaneContent(input: string): string {
  const noDim = stripDimText(input);
  const noAnsi = stripAnsiEscapes(noDim);
  return noAnsi.replace(/ {2,}/g, " ");
}
