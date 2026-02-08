// Re-export shared types used by server-side code
export type { SessionResponse } from "../shared/types";

// Internal types for tmux polling

export interface SessionState {
  pane_id: string;
  process_pid: number;
  cwd: string;
  project_name: string;
  git_branch: string | null;
  status: "busy" | "waiting";
  summary: string | null;
  tmux_target: string;
  jsonl_path: string | null;
  last_changed: number;
  last_activity: string;
  summary_pending: boolean;
  last_summary_time: number;
}

export interface TmuxPane {
  pane_id: string;
  pane_pid: number;
  session_name: string;
  window_index: number;
  pane_index: number;
}

export interface ClaudeProcess {
  pid: number;
  ppid: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
}
