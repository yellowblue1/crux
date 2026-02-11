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
 * Detects pane actions using Gemini, triggered manually by user click.
 * Returns a `detect` function that the user invokes via the wand button.
 * Results persist until the user triggers detection again.
 */
export function useActionDetection(paneId: string) {
  const query = useQuery({
    queryKey: actionKeys.detect(paneId),
    queryFn: () => fetchActions(paneId),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return {
    action: query.data ?? DEFAULT_ACTION,
    isDetecting: query.isFetching,
    detect: () => query.refetch(),
  };
}
