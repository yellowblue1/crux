import type { PaneContentResponse } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { sessionKeys } from "@/lib/query-keys";
import { sessionsApi } from "@/lib/rpc-client";

const PANE_CONTENT_POLL_INTERVAL = 2000;

const fetchPaneContent = async (paneId: string): Promise<PaneContentResponse> => {
  const res = await sessionsApi[":pane_id"]["pane-content"].$get({
    param: { pane_id: paneId },
  });
  if (!res.ok) throw new Error("Failed to fetch pane content");
  return await res.json();
};

export function usePaneContent(paneId: string) {
  return useQuery({
    queryKey: sessionKeys.paneContent(paneId),
    queryFn: () => fetchPaneContent(paneId),
    refetchInterval: PANE_CONTENT_POLL_INTERVAL,
    staleTime: 0,
  });
}
