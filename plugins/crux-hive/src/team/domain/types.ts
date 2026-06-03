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
  // Claude Code session id assigned at launch via --session-id. Recorded so the
  // worker can be resumed (`claude --resume <sessionId>`) after an instance
  // restart. Optional for backward compatibility with configs written before
  // team-resume existed.
  sessionId?: string;
  // tmux window name used at launch, recorded so resume restores the same name
  // rather than re-deriving it. Optional for backward compatibility.
  windowName?: string;
}

export interface TeamConfig {
  name: string;
  leadAgentId: string;
  leadSessionId: string;
  members: TeamMember[];
}
