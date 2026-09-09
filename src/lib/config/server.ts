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
    postcardRetentionDays: Math.round(numericEnv("POSTCARD_RETENTION_DAYS", 365)),
    postcardBucket: process.env.SUPABASE_POSTCARDS_BUCKET || "khw-postcards",
    sponsorPrivateBucket: process.env.SUPABASE_SPONSOR_PRIVATE_BUCKET || "khw-sponsor-private",
    sponsorPublicBucket: process.env.SUPABASE_SPONSOR_PUBLIC_BUCKET || "khw-sponsor-public",
    dayPhotoBucket: process.env.SUPABASE_DAY_PHOTOS_BUCKET || "khw-day-photos",
    sponsorReservationMinutes: Math.round(numericEnv("SPONSOR_RESERVATION_MINUTES", 30)),
    sponsorPaymentProvider: process.env.SPONSOR_PAYMENT_PROVIDER === "fixture" ? "fixture" as const : "lemonsqueezy" as const,
  };
}
