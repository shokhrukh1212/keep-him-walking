/**
 * The proposed sponsorship, word for word. It is an inquiry only: nothing here takes a bid,
 * a payment or a reservation, and nothing promises traffic, posts, leads or sales.
 */
export const PROPOSED_STARTING_PRICE_USD = 50;

/** Each replacement sponsor would pay twice the current sponsor's price. */
export function replacementPriceLadder(startingUsd: number, steps: number): number[] {
  if (!Number.isFinite(startingUsd) || startingUsd <= 0 || !Number.isInteger(steps) || steps < 1) return [];
  return Array.from({ length: steps }, (_, index) => startingUsd * 2 ** index);
}

export function formatLadder(prices: readonly number[]): string {
  return `${prices.map((price) => `$${price}`).join(" → ")}…`;
}

export const SPONSOR_INQUIRY_COPY = {
  headline: "Feature your product on the journey",
  price: `Proposed starting price: $${PROPOSED_STARTING_PRICE_USD}`,
  oneAtATime: "One featured sponsor at a time.",
  rule: `Proposed future rule: each replacement sponsor pays twice the current sponsor’s price (${formatLadder(replacementPriceLadder(PROPOSED_STARTING_PRICE_USD, 4))}). The displaced sponsor receives a full refund, and the replacement gets the remaining travel period.`,
  pending: "This is pending payment-provider approval. It is not accepting bids or payments.",
  checkoutLabel: "Checkout unavailable",
  checkoutNote: "Awaiting payment-provider approval.",
  xLabel: "Message me on X",
  contact: "Message me to discuss sponsorship. No payment or reservation is made here.",
  coffee: "Buy Me a Coffee is separate, voluntary support and does not buy a sponsor slot.",
} as const;
