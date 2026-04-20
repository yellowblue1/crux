export type TeamLeadSummary = {
  readonly teamName: string;
  readonly leadSessionId: string;
  readonly leadCwd: string;
};

export type RefreshDecision =
  | { readonly kind: "noop" }
  | {
      readonly kind: "refresh";
      readonly teamName: string;
      readonly staleLeadSessionId: string;
      readonly newLeadSessionId: string;
    };
