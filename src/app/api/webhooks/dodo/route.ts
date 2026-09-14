import { NextResponse } from "next/server";
import { parseDodoWebhook, verifyStandardWebhook } from "@/lib/payments/dodo";
import { handleDodoEvent } from "@/lib/payments/season";
import { claimWebhookEvent, finishWebhookEvent } from "@/lib/payments/webhook-ledger";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError, readLimitedText } from "@/lib/validation/http";

/**
 * Signed Dodo Payments events for the season offer. The signature is checked over
 * the raw body before anything is parsed, every event id is claimed once, and a
 * payment is never taken from the event body: it is read back from Dodo and
 * re-checked in Postgres. A browser return URL is never treated as payment.
 */
export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 65_536);
  } catch {
    return apiError(413, "PAYLOAD_TOO_LARGE", "Webhook payload is too large.");
  }
  const eventId = request.headers.get("webhook-id");
  const verified = verifyStandardWebhook({
    id: eventId,
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    body: rawBody,
    secret: process.env.DODO_PAYMENTS_WEBHOOK_SECRET ?? "",
    nowMs: Date.now(),
  });
  if (!verified || !eventId) return apiError(403, "FORBIDDEN", "Invalid webhook signature.");
  let event: ReturnType<typeof parseDodoWebhook>;
  try {
    event = parseDodoWebhook(rawBody);
  } catch {
    return apiError(400, "BAD_REQUEST", "Unsupported webhook payload.");
  }
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Payments are unavailable.");
  const claim = await claimWebhookEvent(supabase, "dodo", eventId, event.type, rawBody);
  if (claim.state === "duplicate") return NextResponse.json({ accepted: true, duplicate: true });
  if (claim.state === "conflict") return apiError(409, "CONFLICT", "Provider event identity was reused with a different payload.");
  if (claim.state === "unavailable") return apiError(503, "UNAVAILABLE", "Webhook ledger unavailable.");
  try {
    const outcome = await handleDodoEvent(supabase, event);
    await finishWebhookEvent(supabase, claim.id, outcome.status, {
      errorCode: outcome.errorCode,
      seasonSponsorshipId: outcome.bookingId ?? null,
    });
    return NextResponse.json({ accepted: true, duplicate: false });
  } catch {
    await finishWebhookEvent(supabase, claim.id, "failed", { errorCode: "PROCESSING_ERROR" });
    return apiError(503, "UNAVAILABLE", "Webhook processing will be retried.");
  }
}
