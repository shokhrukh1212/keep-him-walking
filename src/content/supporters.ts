/**
 * Public acknowledgments maintained by the owner until direct Buy Me a Coffee
 * synchronization is available. Add only people who asked to be named here.
 * Leave coffeeCount null unless the exact count is known from the platform.
 */
export type SupporterAcknowledgment = {
  id: string;
  occurredAt: string;
  displayName: string;
  coffeeCount: number | null;
  /** Add only an owner-verified HTTPS profile. */
  xUrl?: string;
  /** Add only an owner-verified HTTPS startup or company site. */
  startupUrl?: string;
};

// Add real acknowledgments in chronological order. Do not add emails, notes,
// payment IDs, private messages, or anyone who has chosen to remain anonymous.
export const SUPPORTER_ACKNOWLEDGMENTS: readonly SupporterAcknowledgment[] = [];

export type SupporterPage = { items: SupporterAcknowledgment[]; hasEarlier: boolean };

/** The same oldest-first, chat-like paging used by the public list. */
export function supporterPage(records: readonly SupporterAcknowledgment[], beforeId: string | null): SupporterPage {
  const chronological = [...records].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  const end = beforeId === null ? chronological.length : chronological.findIndex((item) => item.id === beforeId);
  if (end < 0) throw new Error("Unknown supporter cursor.");
  const start = Math.max(0, end - 20);
  return { items: chronological.slice(start, end), hasEarlier: start > 0 };
}
