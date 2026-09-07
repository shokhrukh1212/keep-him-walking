export const SPONSORSHIP_STATES = [
  "draft", "checkout_pending", "paid_pending_review", "approved", "scheduled",
  "live", "completed", "rejected", "refunded", "cancelled",
] as const;

export type SponsorshipState = (typeof SPONSORSHIP_STATES)[number];

const allowed: Record<SponsorshipState, readonly SponsorshipState[]> = {
  draft: ["checkout_pending", "cancelled"],
  checkout_pending: ["paid_pending_review", "cancelled", "refunded"],
  paid_pending_review: ["approved", "rejected", "refunded"],
  approved: ["scheduled", "rejected", "refunded"],
  scheduled: ["live", "rejected", "refunded", "cancelled"],
  live: ["completed", "refunded", "cancelled"],
  completed: ["refunded"],
  rejected: ["refunded"],
  refunded: [],
  cancelled: ["paid_pending_review", "refunded"],
};

export function canTransitionSponsorship(from: SponsorshipState, to: SponsorshipState): boolean {
  return from === to || allowed[from].includes(to);
}

export function nextPaymentState(
  current: SponsorshipState,
  eventName: "order_created" | "order_refunded",
): SponsorshipState {
  if (eventName === "order_refunded") return "refunded";
  if (current === "paid_pending_review") return current;
  if (!canTransitionSponsorship(current, "paid_pending_review")) {
    throw new Error(`Illegal sponsor transition: ${current} -> paid_pending_review`);
  }
  return "paid_pending_review";
}
