export const DAY_MS = 24 * 60 * 60 * 1_000;

export const PHASE2_ROUTE = [
  { dayNumber: 1, countryCode: "UZ", countryName: "Uzbekistan", cityName: "Tashkent", timeZone: "Asia/Tashkent", scenePackId: "tashkent-v4" },
  { dayNumber: 2, countryCode: "TJ", countryName: "Tajikistan", cityName: "Dushanbe", timeZone: "Asia/Dushanbe", scenePackId: "dushanbe-v1" },
  { dayNumber: 3, countryCode: "KG", countryName: "Kyrgyzstan", cityName: "Bishkek", timeZone: "Asia/Bishkek", scenePackId: "bishkek-v1" },
  { dayNumber: 4, countryCode: "KZ", countryName: "Kazakhstan", cityName: "Almaty", timeZone: "Asia/Almaty", scenePackId: "almaty-v1" },
  { dayNumber: 5, countryCode: "AZ", countryName: "Azerbaijan", cityName: "Baku", timeZone: "Asia/Baku", scenePackId: "baku-v1" },
  { dayNumber: 6, countryCode: "GE", countryName: "Georgia", cityName: "Tbilisi", timeZone: "Asia/Tbilisi", scenePackId: "tbilisi-v1" },
  { dayNumber: 7, countryCode: "TR", countryName: "Turkey", cityName: "Istanbul", timeZone: "Europe/Istanbul", scenePackId: "istanbul-v1" },
] as const;

export type JourneyState = "prelaunch" | "live" | "intermission" | "completed";

export type ScheduledCountryDay = (typeof PHASE2_ROUTE)[number] & {
  startsAt: string;
  endsAt: string;
};

export function buildSevenDaySchedule(startsAt: Date): ScheduledCountryDay[] {
  const startMs = startsAt.getTime();
  if (!Number.isFinite(startMs)) throw new Error("Journey start must be a valid timestamp");
  return PHASE2_ROUTE.map((entry, index) => ({
    ...entry,
    startsAt: new Date(startMs + index * DAY_MS).toISOString(),
    endsAt: new Date(startMs + (index + 1) * DAY_MS).toISOString(),
  }));
}

export function scaledStoryNow(
  realNow: Date,
  realAnchor: Date | null,
  storyAnchor: Date | null,
  scale = 1,
): Date {
  if (!realAnchor || !storyAnchor) return new Date(realNow);
  if (!Number.isFinite(scale) || scale < 1 || scale > 144) {
    throw new Error("Story clock scale must be between 1 and 144");
  }
  return new Date(storyAnchor.getTime() + (realNow.getTime() - realAnchor.getTime()) * scale);
}

export function resolveJourneyMoment(startsAt: Date, storyNow: Date) {
  const schedule = buildSevenDaySchedule(startsAt);
  const elapsed = storyNow.getTime() - startsAt.getTime();
  if (elapsed < 0) {
    return { journeyState: "prelaunch" as const, countryDay: null, nextRefreshAt: startsAt.toISOString() };
  }
  if (elapsed >= PHASE2_ROUTE.length * DAY_MS) {
    return { journeyState: "completed" as const, countryDay: null, nextRefreshAt: null };
  }
  const dayIndex = Math.floor(elapsed / DAY_MS);
  const countryDay = schedule[dayIndex] ?? null;
  return {
    journeyState: "live" as const,
    countryDay,
    nextRefreshAt: countryDay?.endsAt ?? null,
  };
}
