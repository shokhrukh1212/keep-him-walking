import { SponsorCheckoutForm } from "@/components/sponsor/SponsorCheckoutForm";
import { getServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SponsorPage() {
  const supabase = getServerSupabase();
  const { data } = supabase ? await supabase.from("sponsor_slots")
    .select("id,price_cents,currency,country_days(day_number,country_name,city_name,starts_at)")
    .eq("status", "available").order("created_at", { ascending: true }) : { data: [] };
  const slots = (data ?? []).map((slot) => {
    const day = Array.isArray(slot.country_days) ? slot.country_days[0] : slot.country_days;
    return { id: slot.id, priceCents: slot.price_cents, currency: slot.currency, label: day ? `Day ${day.day_number} · ${day.city_name}, ${day.country_name}` : "Country-day" };
  });
  return <main className="content-page sponsor-page"><Link className="back-link" href="/">← Return to the walk</Link><span className="eyebrow">SPONSOR A COUNTRY-DAY</span><h1>Support one day of the journey.</h1><p>A sponsor receives one clearly disclosed placement, an optional approved backpack patch and first-party aggregate reporting. Payment never bypasses creative review.</p><SponsorCheckoutForm slots={slots} /><nav className="legal-links"><Link href="/sponsor-terms">Sponsor terms</Link><Link href="/refund-policy">Refund & creative policy</Link><Link href="/contact">Contact</Link></nav></main>;
}
