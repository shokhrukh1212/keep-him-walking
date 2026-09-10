import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyMap } from "@/components/map/JourneyMap";
import { SeasonShareButton } from "@/components/season/SeasonShareButton";
import { flagEmoji } from "@/lib/countries/flags";
import { loadJourneyMap } from "@/lib/map/data";
import { stampLabel } from "@/lib/outcomes/stamp";
import { loadSeasonSheet } from "@/lib/season/data";

export const revalidate = 60;

type Props = { params: Promise<{ n: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const seasonNumber = Number((await params).n);
  const sheet = await loadSeasonSheet(seasonNumber);
  if (!sheet) return { title: "Season unavailable — Keep Him Walking" };
  const km = (sheet.stats.confirmedDistanceMetres / 1_000).toFixed(1);
  const title = `Season ${sheet.seasonNumber} — Keep Him Walking`;
  const description = `${sheet.stats.days} days · ${km} km confirmed · ${sheet.stats.countries} countries`;
  return { title, description, openGraph: { title, description, images: [`/api/og/season/${sheet.seasonNumber}`] } };
}

export default async function SeasonPage({ params }: Props) {
  const seasonNumber = Number((await params).n);
  const sheet = await loadSeasonSheet(seasonNumber);
  // A soft 404: the root loading.tsx wraps every route in Suspense, so the shell
  // has already streamed as 200 by the time this runs. Next injects noindex, so
  // an unrun season never reaches search; see TECHNICAL section 6.6.
  if (!sheet) notFound();
  // The map is rendered on the server here: this page is cached, so there is no
  // reason to make every visitor fetch /api/map again.
  const map = await loadJourneyMap();
  const km = (sheet.stats.confirmedDistanceMetres / 1_000).toFixed(1);

  return (
    <main className="content-page season-page">
      <Link className="back-link" href="/">← Return to the walk</Link>
      <span className="eyebrow">SEASON {sheet.seasonNumber}</span>
      <h1>{sheet.title}</h1>
      <p>Every stamp below is a day the server finished and will never revise.</p>

      <section className="recap-stats" aria-label="Confirmed season totals">
        <div><strong>{sheet.stats.days}</strong><small>days walked</small></div>
        <div><strong>{km} km</strong><small>confirmed distance</small></div>
        <div><strong>{sheet.stats.countries}</strong><small>countries</small></div>
        <div><strong>{sheet.stats.marathons}</strong><small>marathons</small></div>
      </section>

      <section aria-label="Stamp sheet">
        <h2>The stamp sheet</h2>
        <div className="stamp-sheet" data-testid="stamp-sheet">{sheet.days.map((day) => (
          <Link
            key={day.countryDayId}
            className="stamp-tile"
            data-stamp={day.stamp ?? "none"}
            data-testid="stamp-tile"
            href={day.stamp && day.stamp !== "current" ? `/day/${day.dayNumber}` : "/"}
          >
            <span className="stamp-day">DAY {day.dayNumber}</span>
            <span className="stamp-flag">{flagEmoji(day.countryCode)}</span>
            <strong>{day.cityName}</strong>
            <small>{stampLabel(day.stamp)}</small>
          </Link>
        ))}</div>
        {sheet.days.length === 0 ? <p>No day of this season has been published yet.</p> : null}
      </section>

      {map ? <section aria-label="Season route">
        <h2>Where he walked</h2>
        <JourneyMap data={map} compact />
      </section> : null}

      <p className="season-share">
        <SeasonShareButton
          seasonNumber={sheet.seasonNumber}
          text={`${sheet.stats.days} days, ${km} km, ${sheet.stats.countries} countries. He is still walking.`}
        />
      </p>
      <p><Link href="/archive">← Back to the passport</Link></p>
    </main>
  );
}
