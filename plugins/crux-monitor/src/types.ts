// Re-export shared types
export type { EventResponse, FilterMode } from "../shared/types";

// Server-only types

export interface Event {
  id: number;
  event_id: string;
  session_id: string;
  event_type: string;
  created_at: string;
  summary: string | null;
  project_dir: string | null;
  project_name: string | null;
  tmux_window_id: string | null;
  git_branch: string | null;
  context_window_used: number | null;
  context_window_remaining: number | null;
}

export interface EventInput {
  session_id?: string;
  cwd?: string;
  context_window?: {
    used_percentage?: number;
    remaining_percentage?: number;
  };
}
