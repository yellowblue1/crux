import type { SendKeysResponse } from "@shared/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface SendKeysInput {
  paneId: string;
  text: string;
}

export function useSendKeys() {
  return useMutation({
    mutationFn: async ({ paneId, text }: SendKeysInput) => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(paneId)}/send-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = (await res.json()) as SendKeysResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send keys");
      }
      return data;
    },
    onError: (error: Error) => {
      toast.error(`Failed to send: ${error.message}`);
    },
  });
}
