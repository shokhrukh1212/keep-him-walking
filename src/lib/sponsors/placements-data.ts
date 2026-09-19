import "server-only";

import { serverRuntimeConfig } from "@/lib/config/server";
import type { SponsorInventoryView, SponsorPlacementView } from "@/lib/contracts";
import { RELAUNCH_JOURNEY } from "@/lib/relaunch/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { placementCheckoutState } from "@/lib/config/placements";

export function emptySponsorInventory(): SponsorInventoryView {
  const checkout = placementCheckoutState();
  return {
    journeyId: null,
    lifecycleState: "waiting",
    scheduledStartAt: null,
    startsAt: null,
    endsAt: null,
    durationDays: 14,
    regularFilled: 0,
    featuredFilled: false,
    checkoutEnabled: checkout.enabled,
    checkoutReason: checkout.enabled ? null : checkout.reason,
    slots: [],
  };
}

export async function loadSponsorInventory(): Promise<SponsorInventoryView> {
  const supabase = getServerSupabase();
  if (!supabase) return emptySponsorInventory();
  const { data: journey, error: journeyError } = await supabase.from("journeys")
    .select("id,lifecycle_state,scheduled_start_at,starts_at,ends_at")
    .eq("slug", RELAUNCH_JOURNEY.slug).maybeSingle();
  if (journeyError) throw journeyError;
  if (!journey) return emptySponsorInventory();
  const { data: slots, error: slotError } = await supabase.from("journey_sponsor_slots")
    .select("id,tier,position,price_cents,currency,state,occupied_order_id")
    .eq("journey_id", journey.id).order("tier").order("position");
  if (slotError) throw slotError;
  const orderIds = (slots ?? []).map((slot) => slot.occupied_order_id).filter((id): id is string => Boolean(id));
  const { data: orders, error: orderError } = orderIds.length
    ? await supabase.from("journey_sponsor_orders")
      .select("id,public_id,product_name,description,product_url,public_logo_path,logo_fit,view_count,status")
      .in("id", orderIds).eq("status", "active")
    : { data: [], error: null };
  if (orderError) throw orderError;
  const byId = new Map((orders ?? []).map((order) => [String(order.id), order]));
  const bucket = serverRuntimeConfig().sponsorPublicBucket;
  const checkout = placementCheckoutState();
  const views: SponsorPlacementView[] = (slots ?? []).map((slot) => {
    const order = slot.occupied_order_id ? byId.get(String(slot.occupied_order_id)) : null;
    return {
      slotId: String(slot.id),
      tier: slot.tier as "regular" | "featured",
      position: Number(slot.position),
      priceCents: Number(slot.price_cents) as 5_000 | 10_000,
      currency: "USD" as const,
      state: order ? "occupied" : slot.state as SponsorPlacementView["state"],
      placement: order?.public_logo_path ? {
        publicId: String(order.public_id),
        name: String(order.product_name),
        description: String(order.description),
        websiteUrl: String(order.product_url),
        logoUrl: supabase.storage.from(bucket).getPublicUrl(String(order.public_logo_path)).data.publicUrl,
        logoFit: order.logo_fit as "crop" | "contain",
        views: Number.isSafeInteger(Number(order.view_count)) ? Number(order.view_count) : null,
      } : null,
    };
  }).sort((a, b) => a.tier === b.tier ? a.position - b.position : a.tier === "regular" ? -1 : 1);
  return {
    journeyId: String(journey.id),
    lifecycleState: journey.lifecycle_state as SponsorInventoryView["lifecycleState"],
    scheduledStartAt: journey.scheduled_start_at,
    startsAt: journey.starts_at,
    endsAt: journey.ends_at,
    durationDays: 14,
    regularFilled: views.filter((slot) => slot.tier === "regular" && slot.state === "occupied").length,
    featuredFilled: views.some((slot) => slot.tier === "featured" && slot.state === "occupied"),
    checkoutEnabled: checkout.enabled,
    checkoutReason: checkout.enabled ? null : checkout.reason,
    slots: views,
  };
}
