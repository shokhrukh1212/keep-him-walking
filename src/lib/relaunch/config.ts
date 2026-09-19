import { SEASON_ONE_ROUTE } from "@/lib/season/anniversary";

export const RELAUNCH_JOURNEY = {
  slug: "paris-relaunch",
  title: "Keep Him Walking — Paris",
  durationDays: 14,
  ownerTimeZone: "Asia/Tashkent",
  regularPriceCents: 5_000,
  featuredPriceCents: 10_000,
  currency: "USD",
  checkoutLifetimeMinutes: 24 * 60,
  waiting: {
    firstGreetingMs: 2_500,
    beatMinMs: 12_000,
    beatMaxMs: 18_000,
    captionMinMs: 5_000,
    captionMaxMs: 8_000,
    miniSceneMinMs: 60_000,
    miniSceneMaxMs: 90_000,
  },
  days: SEASON_ONE_ROUTE.map((stop, index) => ({
    dayNumber: index + 1,
    countryCode: stop.code,
    countryName: stop.country,
    cityName: stop.city,
    timeZone: stop.timeZone,
    scenePackId: stop.packId,
    storySummary: `Day ${index + 1} of the journey from Paris.`,
  })),
} as const;

export type JourneyLifecycleState = "waiting" | "scheduled" | "live" | "ended";
export type SponsorPlacementTier = "regular" | "featured";
export type SponsorLogoFit = "crop" | "contain";

export function placementPriceCents(tier: SponsorPlacementTier): number {
  return tier === "featured" ? RELAUNCH_JOURNEY.featuredPriceCents : RELAUNCH_JOURNEY.regularPriceCents;
}

export function placementDurationCopy(input: {
  state: JourneyLifecycleState;
  endsAt: string | null;
}): string {
  if (input.state === "waiting") {
    return `Visible after payment throughout the waiting period and the full ${RELAUNCH_JOURNEY.durationDays}-day journey once the host starts it.`;
  }
  if (input.state === "scheduled") {
    return `Visible after payment through launch and the full ${RELAUNCH_JOURNEY.durationDays}-day journey.`;
  }
  if (input.state === "live" && input.endsAt) {
    return `Visible for the remaining journey, ending ${new Intl.DateTimeFormat("en", {
      dateStyle: "medium", timeStyle: "short", timeZone: RELAUNCH_JOURNEY.ownerTimeZone,
    }).format(new Date(input.endsAt))} Tashkent time.`;
  }
  return "This journey has ended and its placements are no longer for sale.";
}

export function relaunchPlan() {
  return {
    journey: { slug: RELAUNCH_JOURNEY.slug, title: RELAUNCH_JOURNEY.title },
    days: RELAUNCH_JOURNEY.days,
  };
}

/** Uzbekistan has used UTC+05:00 without daylight-saving changes since 1991. */
export function tashkentLocalToUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const instant = new Date(`${value}:00+05:00`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
