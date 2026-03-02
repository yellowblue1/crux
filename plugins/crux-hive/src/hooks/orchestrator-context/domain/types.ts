export type WorkerState = {
  readonly name: string;
  readonly isActive: boolean;
  readonly cwd?: string;
};

export type OrchestratorState = {
  readonly teamName: string;
  readonly workers: readonly WorkerState[];
};
