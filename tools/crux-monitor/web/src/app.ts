// Main application entry point
// Handles initialization and orchestration

import "./styles/input.css";
import "./components"; // Register Lit components
import { checkAuthStatus } from "./api";
import type { SessionRow } from "./components/session-row";
import {
  clearNotificationTracking,
  requestNotificationPermission,
  showBrowserNotification,
} from "./notifications";
import { connectSSE, setOnSessionsCallback } from "./sse";
import { getReadStatus, initDb, setReadStatus } from "./storage";
import type { SessionResponse } from "./types";
import { hideElement, showElement, showWarningBanner } from "./ui";

// Track previous session states for notification management
const previousStatuses = new Map<string, string>();

/**
 * Render sessions using Lit components
 */
async function renderSessions(sessions: SessionResponse[]): Promise<void> {
  const table = document.getElementById("sessions-table");
  const emptyState = document.getElementById("empty-state");
  const tbody = document.getElementById("sessions-body");

  if (!table || !emptyState || !tbody) return;

  if (sessions.length === 0) {
    hideElement(table);
    showElement(emptyState);
    return;
  }

  showElement(table);
  hideElement(emptyState);

  // Clear existing rows
  tbody.innerHTML = "";

  // Create session-row elements for each session
  for (const session of sessions) {
    const isRead = await getReadStatus(session.pane_id);
    const sessionRow = document.createElement("session-row") as SessionRow;
    sessionRow.session = session;
    sessionRow.isRead = isRead;
    tbody.appendChild(sessionRow);
  }
}

// Initialize application

const AUTH_DISMISSED_KEY = "crux-auth-warning-dismissed";

async function init(): Promise<void> {
  // Request notification permission early
  requestNotificationPermission();

  // Initialize IndexedDB
  await initDb();

  // Check auth status for AI summary feature
  const authDismissed = sessionStorage.getItem(AUTH_DISMISSED_KEY) === "true";
  if (!authDismissed) {
    const authStatus = await checkAuthStatus();
    if (!authStatus.ai_summary_available) {
      let message: string;
      if (!authStatus.gcloud_authenticated) {
        message = "AI summaries unavailable: Run <code>gcloud auth login</code> to enable.";
      } else if (!authStatus.gcp_project_configured) {
        message =
          "AI summaries unavailable: Configure GCP project with <code>gcloud config set project PROJECT_ID</code>.";
      } else {
        message = "AI summaries unavailable: Check your GCloud configuration.";
      }
      showWarningBanner(message);

      const dismissBtn = document.getElementById("warning-dismiss");
      if (dismissBtn) {
        dismissBtn.addEventListener("click", () => {
          const banner = document.getElementById("warning-banner");
          if (banner) banner.classList.add("hidden");
          sessionStorage.setItem(AUTH_DISMISSED_KEY, "true");
        });
      }
    }
  }

  // Set up SSE sessions callback
  setOnSessionsCallback(async (data) => {
    // Handle notification tracking
    const currentPaneIds = new Set<string>();
    for (const session of data.sessions) {
      currentPaneIds.add(session.pane_id);
      const prevStatus = previousStatuses.get(session.pane_id);

      // Show notification on transition to WAITING
      if (session.status === "waiting" && prevStatus !== "waiting") {
        showBrowserNotification(session);
        // Reset read status so copy button becomes clickable again
        await setReadStatus(session.pane_id, false);
      }

      // Clear notification tracking when back to BUSY
      if (session.status === "busy" && prevStatus === "waiting") {
        clearNotificationTracking(session.pane_id);
      }

      previousStatuses.set(session.pane_id, session.status);
    }

    // Clean up tracking for removed sessions
    for (const paneId of previousStatuses.keys()) {
      if (!currentPaneIds.has(paneId)) {
        previousStatuses.delete(paneId);
        clearNotificationTracking(paneId);
      }
    }

    await renderSessions(data.sessions);
  });

  // Start SSE connection
  connectSSE();
}

init();
