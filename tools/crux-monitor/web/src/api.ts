// API client functions

import type { AuthStatusResponse, SessionsApiResponse } from "./types";

/**
 * Fetch all sessions
 */
export async function fetchSessions(): Promise<SessionsApiResponse | null> {
  try {
    const response = await fetch("/api/sessions");
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error("Failed to fetch sessions:", err);
  }
  return null;
}

/**
 * Jump to a tmux pane
 */
export async function jumpToSession(paneId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(paneId)}/jump`, {
      method: "POST",
    });
    if (response.ok) {
      const data = await response.json();
      return data.success === true;
    }
  } catch (err) {
    console.error("Failed to jump to session:", err);
  }
  return false;
}

/**
 * Check authentication status for AI summary feature
 */
export async function checkAuthStatus(): Promise<AuthStatusResponse> {
  try {
    const response = await fetch("/api/auth/status");
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error("Failed to check auth status:", err);
  }
  return {
    gcloud_authenticated: false,
    gcp_project_configured: false,
    ai_summary_available: false,
  };
}
