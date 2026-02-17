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
}

export interface TeamConfig {
  name: string;
  leadAgentId: string;
  leadSessionId: string;
  members: TeamMember[];
}
