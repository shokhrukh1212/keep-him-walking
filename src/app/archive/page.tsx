import { PassportArchive } from "@/components/archive/PassportArchive";
import { getServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const supabase = getServerSupabase();
  const { data } = supabase ? await supabase.from("country_days")
    .select("id,day_number,country_name,city_name,scene_pack_id,story_summary")
    .eq("status", "completed").order("starts_at", { ascending: true }) : { data: [] };
  return <main className="content-page"><Link className="back-link" href="/">← Return to the walk</Link><span className="eyebrow">TRAVELER PASSPORT</span><h1>The journey so far</h1><p>Completed country-days are public. Stamps show which scenes this browser personally visited.</p><PassportArchive days={data ?? []} /></main>;
}
