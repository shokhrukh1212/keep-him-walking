import "server-only";
import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ticketDestinations } from "./catalog";
import { ticketPriceCents } from "./product";

export type TicketDayChoice = {
  slotId: string;
  date: string;
  dayNumber: number;
  priceCents: number;
};

export async function loadTicketOffer() {
  const config = serverRuntimeConfig();
  if (!config.ticketsEnabled) return null;
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data: journey } = await supabase.from("journeys")
    .select("id,starts_at")
    .eq("phase2_enabled", true).in("status", ["preview", "active"])
    .order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (!journey) return null;
  const { data: current } = await supabase.from("country_days")
    .select("day_number").eq("journey_id", journey.id).eq("status", "live").maybeSingle();
  if (!current || current.day_number < 8) return null;
  const minDay = current.day_number + 3;
  const maxDay = current.day_number + config.ticketHorizonDays;
  const { data: slots } = await supabase.from("sponsor_slots")
    .select("id,slot_date,price_cents,status")
    .eq("journey_id", journey.id).eq("status", "available")
    .order("slot_date", { ascending: true });
  const launchDay = new Date(`${new Date(journey.starts_at).toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  const days = (slots ?? []).flatMap<TicketDayChoice>((slot) => {
    const slotDate = new Date(`${slot.slot_date}T00:00:00Z`).getTime();
    const dayNumber = Math.round((slotDate - launchDay) / 86_400_000) + 1;
    return dayNumber >= minDay && dayNumber <= maxDay ? [{
      slotId: slot.id, date: slot.slot_date, dayNumber,
      priceCents: ticketPriceCents(Number(slot.price_cents)),
    }] : [];
  });
  return { currentDay: current.day_number, horizonDays: config.ticketHorizonDays, days, destinations: ticketDestinations() };
}
