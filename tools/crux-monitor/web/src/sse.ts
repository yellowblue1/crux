// SSE (Server-Sent Events) connection management

import { fetchSessions } from "./api";
import type { SessionsApiResponse } from "./types";
import { setConnectionStatus } from "./ui";

// Constants
const POLL_INTERVAL_MS = 5000;
const RECONNECT_TIMEOUT_MS = 30000;

// Connection state
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let onSessionsCallback: ((data: SessionsApiResponse) => void) | null = null;

/**
 * Set the callback for when sessions data is received
 */
export function setOnSessionsCallback(callback: (data: SessionsApiResponse) => void): void {
  onSessionsCallback = callback;
}

/**
 * Poll sessions from API (fallback when SSE fails)
 */
async function pollSessions(): Promise<void> {
  const data = await fetchSessions();
  if (data && onSessionsCallback) {
    onSessionsCallback(data);
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

  eventSource = new EventSource("/api/sessions/stream");

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
      const data: SessionsApiResponse = JSON.parse(event.data);
      if (onSessionsCallback) {
        onSessionsCallback(data);
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
      pollTimer = setInterval(pollSessions, POLL_INTERVAL_MS);
      pollSessions(); // Immediate poll
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
