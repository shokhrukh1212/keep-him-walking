/**
 * Season 1, "The Anniversary Journey": the one place its calendar is written down.
 *
 * Calendar days are Asia/Tashkent days. Tashkent is UTC+5 all year (no daylight saving),
 * so every local midnight is 19:00 UTC on the previous date. The database stores the
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
  if (!Number.isFinite(midnightUtc)) throw new Error("Expected a real calendar date");
  return new Date(midnightUtc - TASHKENT_UTC_OFFSET_HOURS * HOUR_MS).toISOString();
}

/** The UTC instant of `hh:00` in Tashkent on `date`. */
function tashkentHourUtc(date: string, hour: number): string {
  return new Date(Date.parse(tashkentMidnightUtc(date)) + hour * HOUR_MS).toISOString();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "September 17": the Tashkent calendar date of a local-midnight-or-later instant. */
export function tashkentDateLabel(iso: string): string {
  const local = new Date(Date.parse(iso) + TASHKENT_UTC_OFFSET_HOURS * HOUR_MS);
  return `${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}

export const ANNIVERSARY_TIME_ZONE = "Asia/Tashkent";

export const ANNIVERSARY_JOURNEY = (() => {
  const travelStartsAt = tashkentMidnightUtc("2026-09-17");
  const travelEndsAt = tashkentMidnightUtc("2026-10-01");
  const pollOpensAt = tashkentMidnightUtc("2026-09-24");
  const pollClosesAt = tashkentHourUtc("2026-09-28", 20);
  return {
    seasonNumber: 1,
    brand: "Keep Him Walking",
    title: "The Anniversary Journey",
    timeZone: ANNIVERSARY_TIME_ZONE,
    totalDays: 14,
    daysPerCity: 2,
    /** The public preview day: the name vote runs from its first minute until travel begins. */
    previewStartsAt: tashkentMidnightUtc("2026-09-16"),
    travelStartsAt,
    travelEndsAt,
    anniversaryDate: "2026-10-01",
    /** Tashkent midnight in UTC: every season day starts and ends on this hour. */
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
export const ANNIVERSARY_STORY = "My first wedding anniversary is October 1. I’m building a fourteen-day virtual journey while working toward covering my expenses and a gift for my wife. Follow the journey, help choose the celebration setting in Tashkent, and return for the anniversary update.";

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
