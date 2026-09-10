import "server-only";
import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";

export type SponsorDay = {
  date: string;
  priceCents: number;
  basisUniques: number;
  founding: boolean;
  /** Present only once the destination vote has named the day's city. */
  city: string | null;
  country: string | null;
  dayNumber: number | null;
  /** The name of whoever bought it, or null while the day is still for sale. */
  soldTo: string | null;
  slotId: string | null;
  available: boolean;
};

export type SponsorWindow = {
  days: SponsorDay[];
  premiumMultiplier: number;
  floorCents: number;
  capCents: number;
  centsPerUnique: number;
  /** Today's city, so a buyer knows the region even before tomorrow is chosen. */
  currentCity: string | null;
};

type SlotRow = {
  id: string;
  slot_date: string;
  status: string;
  country_day_id: string | null;
  country_days: { day_number: number; city_name: string; country_name: string } | { day_number: number; city_name: string; country_name: string }[] | null;
  sponsorships: { sponsor_name: string; status: string }[] | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** A sponsorship still holds the slot unless it was rejected, refunded or cancelled. */
const RELEASED = new Set(["rejected", "refunded", "cancelled"]);

export async function loadSponsorWindow(): Promise<SponsorWindow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const config = serverRuntimeConfig();

  const { data: journey } = await supabase.from("journeys").select("id")
    .in("status", ["preview", "active", "completed"])
    .order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (!journey) return null;

  const { data: pricing } = await supabase.from("sponsor_pricing")
    .select("day_date,price_cents,basis_uniques,founding")
    .eq("journey_id", journey.id)
    .order("day_date", { ascending: true });
  if (!pricing?.length) return null;

  const dates = pricing.map((row) => row.day_date as string);
  const { data: slots } = await supabase.from("sponsor_slots")
    .select("id,slot_date,status,country_day_id,country_days(day_number,city_name,country_name),sponsorships!sponsorships_slot_id_fkey(sponsor_name,status)")
    .eq("journey_id", journey.id)
    .in("slot_date", dates);

  const { data: current } = await supabase.from("country_days")
    .select("city_name").eq("journey_id", journey.id).eq("status", "live").maybeSingle();

  const slotByDate = new Map<string, SlotRow>();
  for (const slot of (slots ?? []) as SlotRow[]) slotByDate.set(slot.slot_date, slot);

  const days = pricing.map((row) => {
    const slot = slotByDate.get(row.day_date as string) ?? null;
    const day = firstRelation(slot?.country_days ?? null);
    const holder = (slot?.sponsorships ?? []).find((s) => !RELEASED.has(s.status)) ?? null;
    return {
      date: row.day_date as string,
      priceCents: Number(row.price_cents),
      basisUniques: Number(row.basis_uniques),
      founding: Boolean(row.founding),
      city: day?.city_name ?? null,
      country: day?.country_name ?? null,
      dayNumber: day?.day_number ?? null,
      // Only a paid, still-held purchase is social proof. A checkout someone
      // abandoned is not a sale and must not read as one.
      soldTo: holder && holder.status !== "checkout_pending" && holder.status !== "draft"
        ? holder.sponsor_name
        : null,
      slotId: slot?.id ?? null,
      available: slot?.status === "available",
    } satisfies SponsorDay;
  });

  return {
    days,
    premiumMultiplier: config.sponsorPremiumMultiplier,
    floorCents: config.sponsorFloorCents,
    capCents: config.sponsorCapCents,
    centsPerUnique: config.sponsorCentsPerUnique,
    currentCity: current?.city_name ?? null,
  };
}

/** The price the dock advertises: the cheapest day still genuinely for sale. */
export function nextOpenPriceCents(window: SponsorWindow | null): number | null {
  const open = window?.days.filter((day) => day.available && !day.soldTo) ?? [];
  return open.length ? Math.min(...open.map((day) => day.priceCents)) : null;
}
