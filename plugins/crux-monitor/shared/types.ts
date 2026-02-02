// Shared types for client/server communication
// These types are used in API requests and responses

export interface EventResponse {
  id: number;
  event_id: string;
  session_id: string;
  event_type: string;
  created_at: string;
  project_name: string;
  git_branch: string | null;
  summary: string;
  tmux_command: string | null;
  tmux_window_id: string | null;
}

export type FilterMode = "waiting" | "active" | "all";

export interface SessionStatusResponse {
  exists: boolean;
  process_pid: number | null;
  process_running: boolean;
}

export interface EventsApiResponse {
  events: EventResponse[];
  last_modified: number;
}

export interface PruneCandidate {
  session_id: string;
  project_name: string | null;
}

export interface PrunePreviewResponse {
  count: number;
  sessions: PruneCandidate[];
}

export interface PruneResponse {
  deleted_count: number;
}

export interface AuthStatusResponse {
  gcloud_authenticated: boolean;
  gcp_project_configured: boolean;
  ai_summary_available: boolean;
}
