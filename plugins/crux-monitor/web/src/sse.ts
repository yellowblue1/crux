// SSE (Server-Sent Events) connection management

import { fetchEvents } from "./api";
import type { EventsApiResponse, FilterMode } from "./types";
import { setConnectionStatus } from "./ui";

// Constants
const POLL_INTERVAL_MS = 5000;
const RECONNECT_TIMEOUT_MS = 30000;

// Connection state
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentMode: FilterMode = "waiting";
let onEventsCallback: ((events: EventsApiResponse) => void) | null = null;

/**
 * Set the callback for when events are received
 */
export function setOnEventsCallback(callback: (events: EventsApiResponse) => void): void {
  onEventsCallback = callback;
}

/**
 * Set the current filter mode
 */
export function setCurrentMode(mode: FilterMode): void {
  currentMode = mode;
}

/**
 * Get the current filter mode
 */
export function getCurrentMode(): FilterMode {
  return currentMode;
}

/**
 * Poll events from API (fallback when SSE fails)
 */
async function pollEvents(): Promise<void> {
  const data = await fetchEvents(currentMode);
  if (data && onEventsCallback) {
    onEventsCallback(data);
  }
}

/**
 * Connect to SSE stream
 */
export function connectSSE(): void {
  // Close existing connection
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`/api/events/stream?mode=${currentMode}`);

  eventSource.onopen = () => {
    setConnectionStatus("connected");
    // Stop polling if SSE connects
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  eventSource.onmessage = (event) => {
    try {
      const data: EventsApiResponse = JSON.parse(event.data);
      if (onEventsCallback) {
        onEventsCallback(data);
      }
    } catch (err) {
      console.error("Failed to parse event data:", err);
    }
  };

  eventSource.onerror = () => {
    setConnectionStatus("disconnected");
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    // Fallback to polling
    if (!pollTimer) {
      setConnectionStatus("polling");
      pollTimer = setInterval(pollEvents, POLL_INTERVAL_MS);
      pollEvents(); // Immediate poll
    }

    // Try to reconnect SSE after timeout
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (pollTimer) {
        connectSSE();
      }
    }, RECONNECT_TIMEOUT_MS);
  };
}
