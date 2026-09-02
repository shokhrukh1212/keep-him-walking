import sharp from "sharp";
import { fixturePaymentsAllowed } from "../../src/lib/config/phase2-policy";
import { adminClient, requireApply } from "./lib";

if (!fixturePaymentsAllowed()) throw new Error("Fixture sponsor rehearsal is allowed only in the guarded Phase 2 preview");
requireApply({
  adapter: "fixture",
  payment: "no money",
  cases: ["approval-presentation-metrics", "cancellation", "refund", "emergency-removal"],
});

const supabase = adminClient();
const journeyResult = await supabase.from("journeys")
  .select("id,real_time_anchor_at,country_days(id,day_number)")
  .eq("slug", "phase2-seven-day-preview")
  .eq("status", "preview")
  .single();
if (journeyResult.error) throw journeyResult.error;
const journey = journeyResult.data;
const days = [...(journey.country_days as Array<{ id: string; day_number: number }>)].sort((a, b) => a.day_number - b.day_number);
if (days.length !== 7) throw new Error("Fixture rehearsal requires the seven-day preview seed");

const webhookCountBefore = await supabase.from("payment_webhook_events").select("id", { count: "exact", head: true });
const now = new Date();

async function reserve(dayIndex: number, label: string) {
  const day = days[dayIndex];
  if (!day) throw new Error(`Missing country day ${dayIndex + 1}`);
  const slotResult = await supabase.from("sponsor_slots").select("id,status").eq("country_day_id", day.id).single();
  if (slotResult.error || !slotResult.data) throw new Error(`Missing sponsor slot for day ${dayIndex + 1}`);
  const slot = slotResult.data;
  const result = await supabase.rpc("reserve_sponsor_slot", {
    p_slot_id: slot.id,
    p_sponsor_name: `TEST FIXTURE — ${label}`,
    p_sponsor_email: `fixture-${dayIndex + 1}@example.invalid`,
    p_test_mode: true,
    p_now: now.toISOString(),
    p_reservation_minutes: 30,
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

async function markPaid(sponsorship: { id: string; slot_id: string }) {
  const paidAt = new Date().toISOString();
  const sponsorUpdate = await supabase.from("sponsorships")
    .update({ status: "paid_pending_review", paid_at: paidAt, updated_at: paidAt })
    .eq("id", sponsorship.id).eq("status", "checkout_pending");
  if (sponsorUpdate.error) throw sponsorUpdate.error;
  const slotUpdate = await supabase.from("sponsor_slots")
    .update({ status: "sold", reserved_by: null, reserved_until: null, updated_at: paidAt })
    .eq("id", sponsorship.slot_id);
  if (slotUpdate.error) throw slotUpdate.error;
}

const creative = await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 19, g: 58, b: 67, alpha: 1 } },
}).composite([{ input: Buffer.from('<svg width="512" height="512"><rect x="28" y="28" width="456" height="456" rx="72" fill="#f5cf79"/><text x="256" y="235" text-anchor="middle" font-family="sans-serif" font-size="46" font-weight="700" fill="#16323b">TEST</text><text x="256" y="298" text-anchor="middle" font-family="sans-serif" font-size="38" fill="#16323b">SPONSOR</text></svg>') }]).webp({ quality: 84 }).toBuffer();

const presentation = await reserve(0, "PRESENTATION");
await markPaid(presentation);
const privatePath = `${presentation.id}/fixture-creative.webp`;
const publicPath = `${presentation.id}/approved-fixture-creative.webp`;
const privateUpload = await supabase.storage.from(process.env.SUPABASE_SPONSOR_PRIVATE_BUCKET ?? "khw-sponsor-private")
  .upload(privatePath, creative, { contentType: "image/webp", upsert: true });
if (privateUpload.error) throw privateUpload.error;
const publicUpload = await supabase.storage.from(process.env.SUPABASE_SPONSOR_PUBLIC_BUCKET ?? "khw-sponsor-public")
  .upload(publicPath, creative, { contentType: "image/webp", upsert: true });
if (publicUpload.error) throw publicUpload.error;
const approvedAt = new Date().toISOString();
const approval = await supabase.from("sponsorships").update({
  status: "approved",
  private_creative_path: privatePath,
  public_creative_path: publicPath,
  cta_label: "Open test sponsor",
  cta_url: "https://example.invalid/fixture-sponsor",
  reviewed_at: approvedAt,
  approved_at: approvedAt,
  updated_at: approvedAt,
}).eq("id", presentation.id).eq("status", "paid_pending_review");
if (approval.error) throw approval.error;
const reconciliation = await supabase.rpc("reconcile_phase2_state", { p_real_now: now.toISOString() });
if (reconciliation.error) throw reconciliation.error;

const metrics = [
  ["impression", "fixture-impression"],
  ["engaged_view", "fixture-engaged"],
  ["watch_second", "fixture-watch"],
  ["cta_click", "fixture-click"],
] as const;
const metricInsert = await supabase.from("sponsor_metric_events").insert(metrics.map(([eventType, dedupe]) => ({
  sponsorship_id: presentation.id,
  event_type: eventType,
  visitor_day_hash: "f".repeat(64),
  dedupe_key: dedupe,
  quantity: eventType === "watch_second" ? 30 : 1,
  occurred_at: now.toISOString(),
  metadata_json: { adapter: "fixture" },
})));
if (metricInsert.error) throw metricInsert.error;
const aggregate = await supabase.rpc("aggregate_sponsor_metrics", {
  p_metric_date: now.toISOString().slice(0, 10),
  p_now: now.toISOString(),
});
if (aggregate.error) throw aggregate.error;

const cancelled = await reserve(1, "CANCELLATION");
await supabase.from("sponsorships").update({ status: "cancelled", updated_at: now.toISOString() }).eq("id", cancelled.id);
await supabase.from("sponsor_slots").update({ status: "available", reserved_by: null, reserved_until: null, updated_at: now.toISOString() }).eq("id", cancelled.slot_id);

const refunded = await reserve(2, "REFUND");
await markPaid(refunded);
await supabase.from("sponsorships").update({ status: "refunded", removed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", refunded.id);
await supabase.from("sponsor_slots").update({ status: "available", reserved_by: null, reserved_until: null, updated_at: now.toISOString() }).eq("id", refunded.slot_id);

const emergency = await reserve(3, "EMERGENCY REMOVAL");
await markPaid(emergency);
await supabase.from("sponsorships").update({ status: "approved", approved_at: now.toISOString(), reviewed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", emergency.id);
await supabase.from("sponsorships").update({ status: "scheduled", updated_at: now.toISOString() }).eq("id", emergency.id);
await supabase.from("sponsorships").update({ status: "live", updated_at: now.toISOString() }).eq("id", emergency.id);
await supabase.from("sponsorships").update({ status: "cancelled", removed_at: now.toISOString(), public_creative_path: null, updated_at: now.toISOString() }).eq("id", emergency.id);

const statuses = await supabase.from("sponsorships").select("id,status").in("id", [presentation.id, cancelled.id, refunded.id, emergency.id]);
if (statuses.error) throw statuses.error;
const webhookCountAfter = await supabase.from("payment_webhook_events").select("id", { count: "exact", head: true });
if (webhookCountBefore.count !== webhookCountAfter.count) throw new Error("Fixture adapter must not write Lemon webhook ledger events");

process.stdout.write(`${JSON.stringify({
  adapter: "fixture",
  realPaymentVerified: false,
  presentationStatus: statuses.data.find((row) => row.id === presentation.id)?.status,
  cancellationStatus: statuses.data.find((row) => row.id === cancelled.id)?.status,
  refundStatus: statuses.data.find((row) => row.id === refunded.id)?.status,
  emergencyRemovalStatus: statuses.data.find((row) => row.id === emergency.id)?.status,
  metricAggregationRows: aggregate.data,
  lemonWebhookLedgerWrites: 0,
})}\n`);
