import { NextRequest, NextResponse } from "next/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";

const MAX_PHOTO_BYTES = 512 * 1024;
const ALLOWED_TYPES = new Set(["image/webp", "image/jpeg"]);

async function handlePost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Unsupported photo type." }, { status: 415 });
  }
  const url = new URL(request.url);
  const atActiveSecond = Number(url.searchParams.get("atActiveSecond"));
  const atDistanceMetres = Number(url.searchParams.get("atDistanceMetres"));
  if (!Number.isInteger(atActiveSecond) || atActiveSecond < 0
    || !Number.isFinite(atDistanceMetres) || atDistanceMetres < 0) {
    return NextResponse.json({ error: "Invalid photo moment." }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Day photos are not configured." }, { status: 503 });
  }
  const now = new Date();
  const countryDay = await findCurrentCountryDay(now);
  if (!countryDay) {
    return NextResponse.json({ error: "No country-day is active." }, { status: 409 });
  }
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.dayPhoto);
  if (!limit.allowed) {
    return rateLimitedResponse(limit.retryAfterSeconds, "Too many photo uploads.");
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo is empty or too large." }, { status: 413 });
  }

  const config = serverRuntimeConfig();
  const extension = contentType === "image/jpeg" ? "jpg" : "webp";
  const storagePath = `${countryDay.id}/${atActiveSecond}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(config.dayPhotoBucket)
    .upload(storagePath, body, { contentType, upsert: false, cacheControl: "31536000" });
  // A duplicate object means another visitor got the same moment there first.
  if (uploadError && !/exists/i.test(uploadError.message)) {
    return NextResponse.json({ error: "Photo storage is unavailable." }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("record_day_photo", {
    p_country_day_id: countryDay.id,
    p_at_active_second: atActiveSecond,
    p_at_distance_metres: atDistanceMetres,
    p_storage_path: storagePath,
  });
  if (error) {
    return NextResponse.json({ error: "Photo could not be recorded." }, { status: 503 });
  }

  const response = NextResponse.json({ stored: data === true });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("day_photos", handlePost);
