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
