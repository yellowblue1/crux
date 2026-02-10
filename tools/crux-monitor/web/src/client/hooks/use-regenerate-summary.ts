import type { RegenerateSummaryResponse } from "@shared/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export function useRegenerateSummary() {
  return useMutation({
    mutationFn: async (paneId: string) => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(paneId)}/regenerate-summary`, {
        method: "POST",
      });

      const data = (await res.json()) as RegenerateSummaryResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to regenerate summary");
      }
      return data;
    },
    onError: (error: Error) => {
      toast.error(`Failed to regenerate: ${error.message}`);
    },
  });
}
