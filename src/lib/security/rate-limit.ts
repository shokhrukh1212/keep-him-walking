import "server-only";

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export type RateLimitPolicy = {
  action: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  bootstrap: { action: "bootstrap", limit: 90, windowSeconds: 60 },
  presence: { action: "presence", limit: 45, windowSeconds: 60 },
  vote: { action: "vote", limit: 10, windowSeconds: 60 },
  postcard: { action: "postcard", limit: 4, windowSeconds: 300 },
  sponsorMetric: { action: "sponsor_metric", limit: 60, windowSeconds: 300 },
  sponsorClick: { action: "sponsor_click", limit: 20, windowSeconds: 300 },
  notification: { action: "notification", limit: 8, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitPolicy>;

export async function consumeRateLimit(keyHash: string, policy: RateLimitPolicy, now = new Date()) {
  const supabase = getServerSupabase();
  if (!supabase) return { configured: false, allowed: false, retryAfterSeconds: policy.windowSeconds };
  const { data, error } = await supabase.rpc("consume_mutation_rate_limit", {
    p_key_hash: keyHash,
    p_action: policy.action,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
    p_now: now.toISOString(),
  });
  return {
    configured: true,
    allowed: !error && Boolean(data),
    retryAfterSeconds: policy.windowSeconds - (Math.floor(now.getTime() / 1000) % policy.windowSeconds),
  };
}

export function rateLimitedResponse(retryAfterSeconds: number, message = "Please wait before trying again.") {
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message } },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)), "Cache-Control": "no-store" } },
  );
}
