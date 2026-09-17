/**
 * Season 1, "The Anniversary Journey": the one place its calendar is written down.
 *
 * Dates are Asia/Tashkent dates. Tashkent is UTC+5 all year (no daylight saving). Travel
 * launches at 21:00 Tashkent (16:00 UTC on 17 September) and each route day is
 * 24 hours. The database stores the
 * season's authoritative instants (configured from here by `pnpm season:replan`); page
 * copy that names a date and the plan builder both read this module, so the two cannot
 * drift apart silently (`plan.test.ts` and `/api/health` compare them).
 */
const TASHKENT_UTC_OFFSET_HOURS = 5;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The UTC instant of 00:00 in Tashkent on `date` (YYYY-MM-DD). */
export function tashkentMidnightUtc(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Expected a YYYY-MM-DD date");
  const midnightUtc = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(midnightUtc) || new Date(midnightUtc).toISOString().slice(0, 10) !== date) throw new Error("Expected a real calendar date");
  return new Date(midnightUtc - TASHKENT_UTC_OFFSET_HOURS * HOUR_MS).toISOString();
}

/** The UTC instant of `hh:00` in Tashkent on `date`. */
function tashkentHourUtc(date: string, hour: number): string {
  return new Date(Date.parse(tashkentMidnightUtc(date)) + hour * HOUR_MS).toISOString();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The Tashkent calendar date of an instant. */
export function tashkentDateLabel(iso: string): string {
  const local = new Date(Date.parse(iso) + TASHKENT_UTC_OFFSET_HOURS * HOUR_MS);
  return `${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}

export const ANNIVERSARY_TIME_ZONE = "Asia/Tashkent";

/** The sole ordered Season 1 route. Missing paintings are reported, never invented. */
export const SEASON_ONE_ROUTE = [
  { city: "Paris", country: "France", code: "FR", timeZone: "Europe/Paris", packId: "paris-v3", lat: 48.8566, lon: 2.3522 },
  { city: "Brussels", country: "Belgium", code: "BE", timeZone: "Europe/Brussels", packId: "brussels-v1", lat: 50.8503, lon: 4.3517 },
  { city: "Amsterdam", country: "Netherlands", code: "NL", timeZone: "Europe/Amsterdam", packId: "amsterdam-v1", lat: 52.3676, lon: 4.9041 },
  { city: "Cologne", country: "Germany", code: "DE", timeZone: "Europe/Berlin", packId: "cologne-v1", lat: 50.9375, lon: 6.9603 },
  { city: "Prague", country: "Czechia", code: "CZ", timeZone: "Europe/Prague", packId: "prague-v1", lat: 50.0755, lon: 14.4378 },
  { city: "Vienna", country: "Austria", code: "AT", timeZone: "Europe/Vienna", packId: "vienna-v1", lat: 48.2082, lon: 16.3738 },
  { city: "Bratislava", country: "Slovakia", code: "SK", timeZone: "Europe/Bratislava", packId: "bratislava-v1", lat: 48.1486, lon: 17.1077 },
  { city: "Budapest", country: "Hungary", code: "HU", timeZone: "Europe/Budapest", packId: "budapest-v1", lat: 47.4979, lon: 19.0402 },
  { city: "Ljubljana", country: "Slovenia", code: "SI", timeZone: "Europe/Ljubljana", packId: "ljubljana-v1", lat: 46.0569, lon: 14.5058 },
  { city: "Zagreb", country: "Croatia", code: "HR", timeZone: "Europe/Zagreb", packId: "zagreb-v1", lat: 45.815, lon: 15.9819 },
  { city: "Belgrade", country: "Serbia", code: "RS", timeZone: "Europe/Belgrade", packId: "belgrade-v1", lat: 44.7866, lon: 20.4489 },
  { city: "Sofia", country: "Bulgaria", code: "BG", timeZone: "Europe/Sofia", packId: "sofia-v1", lat: 42.6977, lon: 23.3219 },
  { city: "Istanbul", country: "Türkiye", code: "TR", timeZone: "Europe/Istanbul", packId: "istanbul-v1", lat: 41.0082, lon: 28.9784 },
  { city: "Tashkent", country: "Uzbekistan", code: "UZ", timeZone: "Asia/Tashkent", packId: "tashkent-v5", lat: 41.2995, lon: 69.2401, transferFromPrevious: "flight" },
] as const;

export function seasonOneDayWindow(dayNumber: number) {
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > SEASON_ONE_ROUTE.length) throw new RangeError("Invalid Season 1 day");
  const start = Date.parse("2026-09-17T16:00:00.000Z") + (dayNumber - 1) * DAY_MS;
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(start + DAY_MS).toISOString() };
}

export const ANNIVERSARY_JOURNEY = (() => {
  const travelStartsAt = seasonOneDayWindow(1).startsAt;
  const travelEndsAt = seasonOneDayWindow(SEASON_ONE_ROUTE.length).endsAt;
  const pollOpensAt = seasonOneDayWindow(8).startsAt;
  const pollClosesAt = tashkentHourUtc("2026-09-28", 20);
  return {
    seasonNumber: 1,
    brand: "Keep Him Walking",
    title: "The Anniversary Journey",
    timeZone: ANNIVERSARY_TIME_ZONE,
    totalDays: SEASON_ONE_ROUTE.length,
    daysPerCity: 1,
    /** The public preview day: the name vote runs for 24 hours before travel begins. */
    previewStartsAt: "2026-09-16T16:00:00.000Z",
    travelStartsAt,
    travelEndsAt,
    anniversaryDate: "2026-10-01",
    /** 16:00 UTC is 21:00 in Tashkent. */
    boundaryUtcHour: new Date(travelStartsAt).getUTCHours(),
    poll: {
      kind: "anniversary" as const,
      question: "Choose the anniversary setting",
      opensAt: pollOpensAt,
      closesAt: pollClosesAt,
      options: ["A park in Tashkent", "A café in Tashkent", "A scenic spot in Tashkent"] as const,
    },
  };
})();

export const ANNIVERSARY_LABELS = {
  travelStarts: tashkentDateLabel(ANNIVERSARY_JOURNEY.travelStartsAt),
  lastTravelDay: tashkentDateLabel(new Date(Date.parse(ANNIVERSARY_JOURNEY.travelEndsAt) - DAY_MS).toISOString()),
  anniversary: tashkentDateLabel(ANNIVERSARY_JOURNEY.travelEndsAt),
  pollOpens: tashkentDateLabel(ANNIVERSARY_JOURNEY.poll.opensAt),
  pollCloses: tashkentDateLabel(ANNIVERSARY_JOURNEY.poll.closesAt),
  pollClosesTime: "20:00 Tashkent time",
} as const;

/** The maker's story, word for word. */
export const ANNIVERSARY_STORY = `My first wedding anniversary is October 1. I’m building a ${ANNIVERSARY_JOURNEY.totalDays}-day virtual journey while working toward covering my expenses and a gift for my wife. Follow the journey, help choose the celebration setting in Tashkent, and return for the anniversary update.`;

export const ANNIVERSARY_VOTE_COPY = {
  explanation: "You choose the setting; I confirm the exact venue later.",
  fairness: "Voting is free, one vote per visitor. Payments and sponsorship never affect the result.",
} as const;

export type AnniversaryPhase = "preview" | "travel" | "anniversary";

export function anniversaryPhaseAt(nowMs: number): AnniversaryPhase {
  if (nowMs < Date.parse(ANNIVERSARY_JOURNEY.travelStartsAt)) return "preview";
  if (nowMs < Date.parse(ANNIVERSARY_JOURNEY.travelEndsAt)) return "travel";
  return "anniversary";
}

/** Day 1–14 while travelling, otherwise null. */
export function anniversaryDayAt(nowMs: number): number | null {
  if (anniversaryPhaseAt(nowMs) !== "travel") return null;
  return Math.floor((nowMs - Date.parse(ANNIVERSARY_JOURNEY.travelStartsAt)) / DAY_MS) + 1;
}

export type PollPhase = "upcoming" | "open" | "closed";

export function pollPhaseAt(nowMs: number): PollPhase {
  if (nowMs < Date.parse(ANNIVERSARY_JOURNEY.poll.opensAt)) return "upcoming";
  if (nowMs < Date.parse(ANNIVERSARY_JOURNEY.poll.closesAt)) return "open";
  return "closed";
}
