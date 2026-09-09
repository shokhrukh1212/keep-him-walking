import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryDisplayName, flagEmoji, formatWatchDuration } from "@/lib/countries/flags";
import { loadRecapDay } from "@/lib/recap/data";
import { outcomeLabel } from "@/lib/recap/image";

export const revalidate = 3_600;

type Props = { params: Promise<{ n: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dayNumber = Number((await params).n);
  const recap = await loadRecapDay(dayNumber);
  if (!recap) return { title: "Day recap unavailable — Keep Him Walking" };
  const title = `Day ${recap.dayNumber} · ${recap.cityName} — Keep Him Walking`;
  const description = `${outcomeLabel(recap)} · ${(recap.distanceMetres / 1_000).toFixed(1)} km · ${recap.uniqueWatchers.toLocaleString()} watchers`;
  return { title, description, openGraph: { title, description, images: [`/api/og/recap/${recap.dayNumber}`] } };
}

export default async function DayRecapPage({ params }: Props) {
  const dayNumber = Number((await params).n);
  const recap = await loadRecapDay(dayNumber);
  if (!recap) notFound();
  const stamp = recap.marathon ? "marathon" : recap.landmarkReached ? "landmark" : "unfinished";
  const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(recap.date));
  return (
    <main className="content-page recap-page">
      <Link className="back-link" href="/">← Return to the walk</Link>
      <span className="eyebrow">DAY {recap.dayNumber} · {date.toUpperCase()}</span>
      <h1>{flagEmoji(recap.countryCode)} {recap.cityName}, {recap.countryName}</h1>
      <div className="outcome-stamp" data-outcome={stamp}>{outcomeLabel(recap)}</div>

      <section className="recap-stats" aria-label="Final confirmed day statistics">
        <div><strong>{(recap.distanceMetres / 1_000).toFixed(1)} km</strong><small>final distance</small></div>
        <div><strong>{recap.uniqueWatchers.toLocaleString()}</strong><small>unique watchers</small></div>
        <div><strong>{recap.peakWatchers.toLocaleString()}</strong><small>peak watching</small></div>
        <div><strong>{recap.countriesCount.toLocaleString()}</strong><small>countries</small></div>
      </section>

      {recap.topCountries.length > 0 ? <section>
        <h2>Who carried him</h2>
        <ol className="recap-countries">{recap.topCountries.map((country) => <li key={country.code}><span>{flagEmoji(country.code)} {countryDisplayName(country.code)}</span><strong>{formatWatchDuration(country.watchSeconds)}</strong></li>)}</ol>
      </section> : null}

      {recap.phrase ? <section className="recap-phrase">
        <span className="eyebrow">THE LOCAL WELCOME</span>
        <h2 lang="und">{recap.phrase.original}</h2>
        <p>{recap.phrase.transliteration} · {recap.phrase.gloss}</p>
        <small>Pronounced {recap.phrase.pronunciation}</small>
      </section> : null}

      {recap.photos.length > 0 ? <section className="day-photos">
        <h2>Photographs from the walk</h2>
        <ul>{recap.photos.map((photo) => <li key={photo.url}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`The walk through ${recap.cityName} at ${(photo.atDistanceMetres / 1_000).toFixed(1)} km`} />
        </li>)}</ul>
      </section> : null}

      <section className="recap-story">
        <h2>The handoff</h2>
        <p>{recap.voteResult ? <>The vote chose {recap.voteResult.countryCode ? `${flagEmoji(recap.voteResult.countryCode)} ` : ""}{recap.voteResult.label} with {recap.voteResult.percent}% of {recap.voteResult.totalBallots.toLocaleString()} confirmed ballots.</> : "No vote result was recorded for this day."}</p>
        <p>{recap.tomorrow ? <><strong>Tomorrow:</strong> {flagEmoji(recap.tomorrow.countryCode)} {recap.tomorrow.cityName}, {recap.tomorrow.countryName}.</> : "This was the final scheduled day."}</p>
      </section>

      <p className="recap-sponsor">{recap.sponsor ? <>Sponsored by <a href={`/r/sponsor/${recap.sponsor.publicId}`}>{recap.sponsor.name}</a>.</> : "This day was unsponsored."}</p>
    </main>
  );
}
