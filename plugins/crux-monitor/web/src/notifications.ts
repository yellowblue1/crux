// Browser notification module for Web UI

import type { EventResponse } from "./types";
import { parseEventType } from "./utils";

// Track shown notifications to prevent duplicates within session
const shownEventIds = new Set<string>();

export function requestNotificationPermission(): void {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

export function showBrowserNotification(event: EventResponse): void {
  // Check browser support for Notification API
  if (!("Notification" in window)) return;

  // Only notify for Stop and Notification events
  if (!event.event_type.startsWith("Stop") && !event.event_type.startsWith("Notification")) {
    return;
  }

  // Skip if already shown in this browser session
  if (shownEventIds.has(event.event_id)) return;
  shownEventIds.add(event.event_id);

  if (Notification.permission !== "granted") return;

  const { baseType, subType } = parseEventType(event.event_type);
  const title = subType
    ? `[${subType}] ${event.project_name}`
    : `[${baseType}] ${event.project_name}`;

  new Notification(title, {
    body: event.summary,
    tag: event.event_id, // Prevents duplicate OS notifications
    icon: "/favicon.ico",
  });
}
