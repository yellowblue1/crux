// Shared types for client/server communication
// These types are used in API requests and responses

export type SessionStatus = "busy" | "waiting";

export interface SessionResponse {
  pane_id: string;
  project_name: string;
  git_branch: string | null;
  status: SessionStatus;
  summary: string | null;
  tmux_target: string;
  last_activity: string;
}

export interface SessionsApiResponse {
  sessions: SessionResponse[];
  timestamp: number;
}

export interface AuthStatusResponse {
  gcloud_authenticated: boolean;
  gcp_project_configured: boolean;
  ai_summary_available: boolean;
}

export interface PaneContentResponse {
  pane_id: string;
  content: string | null;
  timestamp: number;
}

export interface SendKeysRequest {
  text: string;
  /** When true, sends text as a raw tmux key name (no literal mode, no Enter). */
  raw?: boolean;
}

export interface SendKeysResponse {
  success: boolean;
  error?: string;
}

export interface RegenerateSummaryResponse {
  success: boolean;
  error?: string;
}
