// API client functions

import type {
  AuthStatusResponse,
  EventsApiResponse,
  FilterMode,
  PrunePreviewResponse,
  PruneResponse,
  SessionStatusResponse,
} from "./types";

/**
 * Check session status (for process tracking)
 */
export async function checkSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/status`);
    return response.ok
      ? await response.json()
      : { exists: false, process_pid: null, process_running: false };
  } catch {
    return { exists: false, process_pid: null, process_running: false };
  }
}

/**
 * Delete a session
 */
export async function deleteSessionApi(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get prune preview (sessions that would be deleted)
 */
export async function getPrunePreview(): Promise<PrunePreviewResponse> {
  try {
    const response = await fetch("/api/prune/preview");
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error("Failed to get prune preview:", err);
  }
  return { count: 0, sessions: [] };
}

/**
 * Perform prune (delete dead sessions)
 */
export async function performPrune(): Promise<PruneResponse> {
  try {
    const response = await fetch("/api/prune", { method: "POST" });
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error("Failed to perform prune:", err);
  }
  return { deleted_count: 0 };
}

/**
 * Poll events from API
 */
export async function fetchEvents(mode: FilterMode): Promise<EventsApiResponse | null> {
  try {
    const response = await fetch(`/api/events?mode=${mode}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error("Failed to fetch events:", err);
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
