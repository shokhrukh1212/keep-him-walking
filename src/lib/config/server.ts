import "server-only";

import { DEFAULT_PRESENCE_TTL_SECONDS } from "@/lib/presence";
import { phase2DeploymentAllowed } from "@/lib/config/phase2-policy";

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The hour, in UTC, at which a country-day ends and the vote closes. */
export function rolloverUtcHour(): number {
  return Math.min(23, Math.max(0, Math.round(numericEnv("ROLLOVER_UTC_HOUR", 16))));
}

export function serverRuntimeConfig() {
  return {
    rolloverUtcHour: rolloverUtcHour(),
    presenceTtlSeconds: Math.round(
      numericEnv("PRESENCE_TTL_SECONDS", DEFAULT_PRESENCE_TTL_SECONDS),
    ),
    stepsPerActiveSecond: numericEnv("STEPS_PER_ACTIVE_SECOND", 1.8),
    paceCap: Math.min(5, Math.max(1, numericEnv("PACE_CAP", 5))),
    firstWatcherGapSeconds: Math.min(
      86_400,
      Math.max(0, Math.round(numericEnv("FIRST_WATCHER_GAP_SECONDS", 600))),
    ),
    phase2Enabled: phase2DeploymentAllowed(),
    phase2PreviewStartAt: process.env.PHASE2_PREVIEW_START_AT || null,
    phase2RehearsalScale: numericEnv("PHASE2_REHEARSAL_SCALE", 144),
    postcardUnlockSeconds: Math.round(numericEnv("POSTCARD_UNLOCK_SECONDS", 60)),
    // Deliberately lower than the postcard unlock: a stamp records that he was
    // watched, a postcard records that someone stayed.
    passportCollectSeconds: Math.round(numericEnv("PASSPORT_COLLECT_SECONDS", 30)),
    postcardRetentionDays: Math.round(numericEnv("POSTCARD_RETENTION_DAYS", 365)),
    postcardBucket: process.env.SUPABASE_POSTCARDS_BUCKET || "khw-postcards",
    sponsorPrivateBucket: process.env.SUPABASE_SPONSOR_PRIVATE_BUCKET || "khw-sponsor-private",
    sponsorPublicBucket: process.env.SUPABASE_SPONSOR_PUBLIC_BUCKET || "khw-sponsor-public",
    dayPhotoBucket: process.env.SUPABASE_DAY_PHOTOS_BUCKET || "khw-day-photos",
    recapBucket: process.env.SUPABASE_RECAPS_BUCKET || "khw-recaps",
    sponsorReservationMinutes: Math.round(numericEnv("SPONSOR_RESERVATION_MINUTES", 30)),
    // The public price formula (05 section 3); values approved in DECISIONS Q11.
    sponsorFloorCents: Math.round(numericEnv("SPONSOR_FLOOR_CENTS", 4_900)),
    sponsorCentsPerUnique: Math.round(numericEnv("SPONSOR_CENTS_PER_UNIQUE", 1)),
    sponsorFoundingCents: Math.round(numericEnv("SPONSOR_FOUNDING_CENTS", 2_900)),
    sponsorCapCents: Math.round(numericEnv("SPONSOR_CAP_CENTS", 299_900)),
    sponsorPremiumMultiplier: numericEnv("SPONSOR_PREMIUM_MULTIPLIER", 1.5),
    sponsorWindowDays: Math.min(30, Math.max(1, Math.round(numericEnv("SPONSOR_WINDOW_DAYS", 7)))),
    sponsorPaymentProvider: process.env.SPONSOR_PAYMENT_PROVIDER === "fixture" ? "fixture" as const : "lemonsqueezy" as const,
  };
}
