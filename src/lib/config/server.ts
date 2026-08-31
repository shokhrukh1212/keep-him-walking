import "server-only";

import { DEFAULT_PRESENCE_TTL_SECONDS } from "@/lib/presence";

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
  };
}
