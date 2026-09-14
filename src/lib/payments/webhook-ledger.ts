import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import { webhookChecksum } from "./webhook";

type Supabase = NonNullable<ReturnType<typeof getServerSupabase>>;

export type WebhookClaim =
  | { state: "claimed"; id: string }
  | { state: "duplicate" }
  | { state: "conflict" }
  | { state: "unavailable" };

/**
 * One processing claim per provider event. A retry of a processed or in-flight event
 * is a duplicate; a failed or long-stuck one may be processed again; the same event
 * id with a different body is refused.
 */
export async function claimWebhookEvent(
  supabase: Supabase,
  provider: "dodo" | "fixture",
  eventId: string,
  eventName: string,
  rawBody: string,
): Promise<WebhookClaim> {
  const checksum = webhookChecksum(rawBody);
  const inserted = await supabase.from("payment_webhook_events")
    .insert({ provider, provider_event_id: eventId, event_name: eventName, payload_checksum: checksum, processing_status: "received" })
    .select("id").maybeSingle();
  if (!inserted.error && inserted.data) return { state: "claimed", id: String(inserted.data.id) };
  if (inserted.error?.code !== "23505") return { state: "unavailable" };
  const existing = await supabase.from("payment_webhook_events")
    .select("id,payload_checksum,processing_status,received_at")
    .eq("provider", provider).eq("provider_event_id", eventId).maybeSingle();
  if (existing.error || !existing.data) return { state: "unavailable" };
  if (existing.data.payload_checksum !== checksum) return { state: "conflict" };
  const stale = existing.data.processing_status === "received"
    && Date.now() - Date.parse(String(existing.data.received_at)) > 5 * 60_000;
  if (existing.data.processing_status !== "failed" && !stale) return { state: "duplicate" };
  const reclaimed = await supabase.from("payment_webhook_events")
    .update({ processing_status: "received", processed_at: null, error_code: null, received_at: new Date().toISOString() })
    .eq("id", existing.data.id).in("processing_status", ["failed", "received"])
    .select("id").maybeSingle();
  return reclaimed.error || !reclaimed.data ? { state: "unavailable" } : { state: "claimed", id: String(reclaimed.data.id) };
}

export async function finishWebhookEvent(
  supabase: Supabase,
  id: string,
  status: "processed" | "ignored" | "failed",
  detail: { errorCode?: string; seasonSponsorshipId?: string | null } = {},
): Promise<void> {
  await supabase.from("payment_webhook_events").update({
    processing_status: status,
    processed_at: new Date().toISOString(),
    error_code: detail.errorCode ?? null,
    season_sponsorship_id: detail.seasonSponsorshipId ?? null,
  }).eq("id", id);
}
