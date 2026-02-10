export const sessionKeys = {
  all: ["sessions"] as const,
  lists: () => [...sessionKeys.all, "list"] as const,
  paneContent: (paneId: string) => [...sessionKeys.all, "paneContent", paneId] as const,
};

export const authKeys = {
  all: ["auth"] as const,
  status: () => [...authKeys.all, "status"] as const,
};
