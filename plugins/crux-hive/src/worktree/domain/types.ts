export interface StartWorktreeSessionArgs {
  branch: string;
  fromRef?: string;
  planMode?: boolean;
  prompt?: string;
  pluginDir?: string;
  teamName?: string;
  agentName?: string;
  agentColor?: string;
  model?: string;
}

export type SessionResult =
  | { success: true; worktreePath: string }
  | { success: false; error: string };
