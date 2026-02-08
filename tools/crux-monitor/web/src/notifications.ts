// Browser notification module for Web UI

import type { SessionResponse } from "./types";

// Track shown notifications to prevent duplicates within session
const shownPaneIds = new Set<string>();

export function requestNotificationPermission(): void {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

/**
 * Show browser notification when a session transitions to WAITING
 */
export function showBrowserNotification(session: SessionResponse): void {
  if (!("Notification" in window)) return;

  // Only notify for WAITING sessions
  if (session.status !== "waiting") return;

  // Skip if already shown in this browser session
  if (shownPaneIds.has(session.pane_id)) return;
  shownPaneIds.add(session.pane_id);

  if (Notification.permission !== "granted") return;

  const title = `[Waiting] ${session.project_name}`;
  const body = session.summary || "Claude is waiting for input";

  new Notification(title, {
    body,
    tag: `crux-${session.pane_id}`,
    icon: "/favicon.ico",
  });
}

/**
 * Clear notification tracking for a pane (when it goes back to BUSY)
 */
export function clearNotificationTracking(paneId: string): void {
  shownPaneIds.delete(paneId);
}
