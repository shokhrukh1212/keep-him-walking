import "server-only";

import { DEFAULT_PRESENCE_TTL_SECONDS } from "@/lib/presence";
import { phase2DeploymentAllowed } from "@/lib/config/phase2-policy";

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function serverRuntimeConfig() {
  return {
    presenceTtlSeconds: Math.round(
      numericEnv("PRESENCE_TTL_SECONDS", DEFAULT_PRESENCE_TTL_SECONDS),
    ),
    stepsPerActiveSecond: numericEnv("STEPS_PER_ACTIVE_SECOND", 1.8),
    phase2Enabled: phase2DeploymentAllowed(),
    phase2PreviewStartAt: process.env.PHASE2_PREVIEW_START_AT || null,
    phase2RehearsalScale: numericEnv("PHASE2_REHEARSAL_SCALE", 144),
    postcardUnlockSeconds: Math.round(numericEnv("POSTCARD_UNLOCK_SECONDS", 60)),
    postcardRetentionDays: Math.round(numericEnv("POSTCARD_RETENTION_DAYS", 365)),
    postcardBucket: process.env.SUPABASE_POSTCARDS_BUCKET || "khw-postcards",
    sponsorPrivateBucket: process.env.SUPABASE_SPONSOR_PRIVATE_BUCKET || "khw-sponsor-private",
    sponsorPublicBucket: process.env.SUPABASE_SPONSOR_PUBLIC_BUCKET || "khw-sponsor-public",
    sponsorReservationMinutes: Math.round(numericEnv("SPONSOR_RESERVATION_MINUTES", 30)),
    sponsorPaymentProvider: process.env.SPONSOR_PAYMENT_PROVIDER === "fixture" ? "fixture" as const : "lemonsqueezy" as const,
  };
}
