import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyOperations } from "@/components/admin/JourneyOperations";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { RELAUNCH_JOURNEY } from "@/lib/relaunch/config";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function JourneysAdminPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) notFound();
  const supabase = getServerSupabase();
  if (!supabase) notFound();
  const { data: journey } = await supabase.from("journeys").select("id,lifecycle_state,scheduled_start_at")
    .eq("slug", RELAUNCH_JOURNEY.slug).maybeSingle();
  if (!journey) return <main className="content-page admin-page"><Link href="/admin">← Private operations</Link><h1>Paris journey</h1><p>Prepare the journey with the reviewed command before controlling it here.</p></main>;
  const { data: orders } = await supabase.from("journey_sponsor_orders")
    .select("id,product_name,tier,status,moderation_reason").eq("journey_id", journey.id)
    .in("status", ["pending_review", "refund_required", "refund_requested"]).order("created_at");
  return <main className="content-page admin-page"><Link href="/admin">← Private operations</Link><span className="eyebrow">PRIVATE OPERATIONS</span><h1>Journey control</h1><JourneyOperations initialJourney={journey} orders={orders ?? []} /></main>;
}
