import type { PaneAction, PaneActionsResponse } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { actionKeys } from "@/lib/query-keys";

const POLL_INTERVAL_MS = 3000;

const DEFAULT_ACTION: PaneAction = { type: "none" };

async function fetchActions(paneId: string): Promise<PaneAction> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(paneId)}/actions`);
  if (!res.ok) return DEFAULT_ACTION;
  const data: PaneActionsResponse = await res.json();
  return data.action;
}

export function useActionDetection(paneId: string) {
  return useQuery({
    queryKey: actionKeys.detect(paneId),
    queryFn: () => fetchActions(paneId),
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 2000,
    placeholderData: DEFAULT_ACTION,
  });
}
