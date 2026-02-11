/**
 * Detect and extract content above Claude Code's bordered input area.
 *
 * Claude Code renders a bordered input region at the bottom of the terminal:
 *   [Claude output / spinner / tool results]   ← content area
 *   ────────────────────────────────────────    ← top border (U+2500)
 *   ❯ user types here                          ← input area
 *   ────────────────────────────────────────    ← bottom border
 *   [Opus 4.6] 78% context                     ← status bar
 *
 * This module filters out the bordered region so that user typing
 * does not trigger false content-change detections in checkPaneContent().
 */

/**
 * Returns true if the line looks like a border line composed primarily
 * of ─ (U+2500, BOX DRAWINGS LIGHT HORIZONTAL) characters.
 * Accepts borders with embedded text (e.g. "──── @worker-name ──").
 */
function isBorderLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;

  const boxDrawCount = (trimmed.match(/─/g) || []).length;
  // Require at least 4 box-drawing chars AND >= 40% of non-space chars
  return boxDrawCount >= 4 && boxDrawCount / trimmed.length >= 0.4;
}

/**
 * Extract content above Claude Code's bordered input area.
 *
 * Scans from the bottom of the pane to find the last pair of border lines
 * (which delimit the user input area), and returns only the content above
 * the top border line. The status bar below the bottom border is also excluded.
 *
 * If no bordered region is detected (e.g. non-Claude terminal), returns
 * the full content unchanged as a graceful fallback.
 */
export function extractContentAboveBorder(content: string): string {
  const lines = content.split("\n");

  // Scan from bottom to find the last pair of border lines
  let bottomBorderIdx = -1;
  let topBorderIdx = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (isBorderLine(lines[i])) {
      if (bottomBorderIdx === -1) {
        bottomBorderIdx = i;
      } else {
        topBorderIdx = i;
        break;
      }
    }
  }

  // No bordered region found → return original content
  if (topBorderIdx === -1) {
    return content;
  }

  // Take everything above the top border, trim trailing whitespace
  return lines.slice(0, topBorderIdx).join("\n").replace(/\s+$/, "");
}
