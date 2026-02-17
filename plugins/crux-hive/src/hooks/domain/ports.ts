export interface GitConfigAdapter {
  getLocal(key: string): string | null;
  setLocal(key: string, value: string): void;
}
