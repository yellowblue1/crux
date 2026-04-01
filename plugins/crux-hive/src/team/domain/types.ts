export interface TeamMember {
  agentId: string;
  name: string;
  agentType: string;
  model?: string;
  color?: string;
  tmuxPaneId?: string;
  backendType?: string;
  isActive?: boolean;
  cwd?: string;
  prompt?: string;
  planModeRequired?: boolean;
  joinedAt?: number;
  worktreePath?: string;
  sessionId?: string;
  subscriptions?: string[];
  mode?: string;
}

export interface TeamConfig {
  name: string;
  leadAgentId: string;
  leadSessionId: string;
  members: TeamMember[];
  description?: string;
  createdAt?: number;
  hiddenPaneIds?: string[];
  teamAllowedPaths?: Array<{ path: string; readOnly?: boolean }>;
}
