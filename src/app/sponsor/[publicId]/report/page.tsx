import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MetricRow = {
  metric_date: string;
  impressions: number;
  engaged_views: number;
  cta_clicks: number;
  sessions: number;
};

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * First-party aggregate reporting for one sponsorship. Reached through the
 * unguessable public id the sponsor already holds, exactly like the disclosure
 * redirect. Every number is a stored daily aggregate; nothing is estimated.
 */
export default async function SponsorReportPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const supabase = getServerSupabase();
  if (!supabase) notFound();

  const { data: sponsorship } = await supabase.from("sponsorships")
    .select("id,sponsor_name,status,tier,expected_price_cents,sponsor_slots(slot_date,country_days(day_number,city_name,country_name))")
    .eq("public_id", publicId)
    .maybeSingle();
  if (!sponsorship) notFound();

  const slot = Array.isArray(sponsorship.sponsor_slots) ? sponsorship.sponsor_slots[0] : sponsorship.sponsor_slots;
  const day = slot ? (Array.isArray(slot.country_days) ? slot.country_days[0] : slot.country_days) : null;

  const { data: metrics } = await supabase.from("sponsor_daily_metrics")
    .select("metric_date,impressions,engaged_views,cta_clicks,sessions")
    .eq("sponsorship_id", sponsorship.id)
    .order("metric_date", { ascending: true });
  const rows = (metrics ?? []) as MetricRow[];
  const total = rows.reduce((sum, row) => ({
    impressions: sum.impressions + Number(row.impressions),
    engaged: sum.engaged + Number(row.engaged_views),
    clicks: sum.clicks + Number(row.cta_clicks),
    sessions: sum.sessions + Number(row.sessions),
  }), { impressions: 0, engaged: 0, clicks: 0, sessions: 0 });

  return <main className="content-page sponsor-report-page">
    <Link className="back-link" href="/">← Return to the walk</Link>
    <span className="eyebrow">SPONSOR REPORT</span>
    <h1>{sponsorship.sponsor_name}</h1>
    <p>
      {day ? <>Day {day.day_number} · {day.city_name}, {day.country_name}</> : <>Day of {slot?.slot_date ?? "—"}</>}
      {" · "}{sponsorship.tier === "premium" ? "Premium" : "Standard"}
      {" · "}status {String(sponsorship.status).replaceAll("_", " ")}
    </p>

    {rows.length === 0
      ? <p>No aggregated metrics yet. Figures are written once the day has been reconciled at rollover.</p>
      : <>
        <section className="recap-stats" aria-label="Confirmed totals">
          <div><strong>{total.impressions.toLocaleString("en-US")}</strong><small>impressions</small></div>
          <div><strong>{total.engaged.toLocaleString("en-US")}</strong><small>engaged views ≥ 10 s</small></div>
          <div><strong>{total.clicks.toLocaleString("en-US")}</strong><small>link clicks</small></div>
          <div><strong>{total.sessions.toLocaleString("en-US")}</strong><small>sessions</small></div>
        </section>
        <table className="sponsor-report-table">
          <caption className="visually-hidden">Daily confirmed sponsor metrics</caption>
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Impressions</th><th scope="col">Engaged</th><th scope="col">Clicks</th><th scope="col">Sessions</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => <tr key={row.metric_date}>
              <td>{DAY.format(new Date(`${row.metric_date}T00:00:00Z`))}</td>
              <td>{Number(row.impressions).toLocaleString("en-US")}</td>
              <td>{Number(row.engaged_views).toLocaleString("en-US")}</td>
              <td>{Number(row.cta_clicks).toLocaleString("en-US")}</td>
              <td>{Number(row.sessions).toLocaleString("en-US")}</td>
            </tr>)}
          </tbody>
        </table>
      </>}

    <p className="policy-copy">
      These are first-party counts recorded by this site. Impressions and engaged views are
      deduplicated per visitor per five-minute window; clicks are counted at the disclosed
      redirect. No visitor is identified and no IP address is stored.
    </p>
  </main>;
}
