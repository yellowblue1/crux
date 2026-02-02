// Pure utility functions

/**
 * Format ISO timestamp to HH:MM format
 */
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Escape HTML to prevent XSS attacks
 * Uses string replacement for compatibility with non-browser environments
 */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Parsed event type with base type, optional subtype, and CSS class
 */
export interface EventTypeParts {
  baseType: string;
  subType: string | null;
  cssClass: string;
}

/**
 * Parse event type string for badge rendering
 * e.g., "Notification:error" -> { baseType: "Notification", subType: "error", cssClass: "status-badge--notification" }
 */
export function parseEventType(eventType: string): EventTypeParts {
  if (eventType.includes(":")) {
    const [baseType, subType] = eventType.split(":");
    return {
      baseType,
      subType,
      cssClass: `status-badge--${baseType.toLowerCase()}`,
    };
  }
  return {
    baseType: eventType,
    subType: null,
    cssClass: `status-badge--${eventType.toLowerCase()}`,
  };
}

/**
 * Default summaries that indicate no AI-generated summary
 */
const DEFAULT_SUMMARIES = ["Task completed", "Waiting for input"];

/**
 * Check if a summary is AI-generated (non-default)
 */
export function isAiSummary(summary: string): boolean {
  return !DEFAULT_SUMMARIES.includes(summary);
}
