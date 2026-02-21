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
  createWindow(name: string, dir: string): Promise<string>;
  sendKeys(windowId: string, keys: string): Promise<void>;
  waitForShellInit(): Promise<void>;
}

export interface ConfigAdapter {
  getMcpServersFromProject(dir: string): Promise<string[]>;
  updateClaudeConfig(worktreePath: string, mcpServers: string[]): Promise<void>;
}
