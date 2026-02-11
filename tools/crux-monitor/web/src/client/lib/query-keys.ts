export const sessionKeys = {
  all: ["sessions"] as const,
  lists: () => [...sessionKeys.all, "list"] as const,
};

export const authKeys = {
  all: ["auth"] as const,
  status: () => [...authKeys.all, "status"] as const,
};

export const actionKeys = {
  all: ["actions"] as const,
  detect: (paneId: string, contentTimestamp?: number) =>
    [...actionKeys.all, "detect", paneId, contentTimestamp] as const,
};
