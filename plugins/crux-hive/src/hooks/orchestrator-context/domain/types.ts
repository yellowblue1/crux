export type WorkerState = {
  readonly name: string;
  readonly isActive: boolean;
};

export type OrchestratorState = {
  readonly teamName: string;
  readonly workers: readonly WorkerState[];
  readonly customSettings?: string;
};
