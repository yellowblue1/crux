export type WorktreeCreateResult = { success: true } | { success: false; error: string };

export interface GitAdapter {
  createWorktree(
    branch: string,
    fromRef?: string,
    noFetch?: boolean,
  ): Promise<WorktreeCreateResult>;
  getWorktreePath(branch: string): Promise<string>;
}

export interface TmuxAdapter {
  isAvailable(): boolean;
  createWindow(name: string, dir: string, command?: string): Promise<string>;
  /**
   * Returns the current path of every tmux pane across all sessions. Used to
   * detect workers that are already running (resume idempotency) by matching
   * worktree directories — snapshotted once rather than queried per worker.
   */
  listPanePaths(): Promise<ReadonlySet<string>>;
}

export interface ConfigAdapter {
  getMcpServersFromProject(dir: string): Promise<string[]>;
  updateClaudeConfig(worktreePath: string, mcpServers: string[]): Promise<void>;
  readWorkerInstructions(projectDir: string): Promise<string | null>;
}
