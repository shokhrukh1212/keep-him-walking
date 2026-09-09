/** What we call him before the Day-1 vote has named him. */
export const UNNAMED_TRAVELER = "the traveler";

/**
 * His name everywhere: the status pill, share cards and postcards. Until the
 * name vote closes there is no name, and we say so rather than inventing one.
 */
export function travelerDisplayName(name: string | null | undefined): string {
  if (typeof name !== "string") return UNNAMED_TRAVELER;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : UNNAMED_TRAVELER;
}

/** Sentence-leading form, e.g. "Milo is walking" / "The traveler is walking". */
export function travelerSubject(name: string | null | undefined): string {
  const display = travelerDisplayName(name);
  return display === UNNAMED_TRAVELER
    ? `${display.charAt(0).toUpperCase()}${display.slice(1)}`
    : display;
}
