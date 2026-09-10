export const TICKET_FLOOR_CENTS = 24_900;

/** Ticket prices are derived only from the stored Standard price for that day. */
export function ticketPriceCents(dayPriceCents: number): number {
  if (!Number.isInteger(dayPriceCents) || dayPriceCents <= 0) {
    throw new Error("dayPriceCents must be a positive integer");
  }
  return Math.max(TICKET_FLOOR_CENTS, dayPriceCents * 3);
}

export function ticketDayIsEligible(input: {
  currentDay: number;
  targetDay: number;
  horizonDays: number;
}): boolean {
  return input.currentDay >= 8
    && input.targetDay >= input.currentDay + 3
    && input.targetDay <= input.currentDay + input.horizonDays;
}
