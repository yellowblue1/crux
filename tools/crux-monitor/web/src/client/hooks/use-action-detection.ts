import type { PaneAction, PaneActionsResponse } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { actionKeys } from "@/lib/query-keys";

const DEFAULT_ACTION: PaneAction = { type: "none" };

async function fetchActions(paneId: string): Promise<PaneAction> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(paneId)}/actions`);
  if (!res.ok) return DEFAULT_ACTION;
  const data: PaneActionsResponse = await res.json();
  return data.action;
}

/**
 * Detects pane actions using Gemini, triggered by pane content changes.
 * The contentTimestamp parameter drives refetches — the query only runs
 * when the timestamp changes (i.e., when SSE delivers new pane content).
 */
export function useActionDetection(paneId: string, contentTimestamp: number | undefined) {
  const query = useQuery({
    queryKey: actionKeys.detect(paneId, contentTimestamp),
    queryFn: () => fetchActions(paneId),
    enabled: contentTimestamp !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: DEFAULT_ACTION,
  });
  return { ...query, isDetecting: query.isFetching };
}
