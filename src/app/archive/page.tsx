import Link from "next/link";
import { PassportArchive } from "@/components/archive/PassportArchive";
import { loadSeasonSheet } from "@/lib/season/data";
import { latestJourney } from "@/lib/season/data";

// The sheet itself is the same for every visitor, so it can be cached. Which
// days *this* visitor collected arrives separately from /api/me.
export const revalidate = 60;

export default async function ArchivePage() {
  const journey = await latestJourney();
  const sheet = journey ? await loadSeasonSheet(journey.seasonNumber) : null;
  return <main className="content-page">
    <Link className="back-link" href="/">← Return to the walk</Link>
    <span className="eyebrow">TRAVELER PASSPORT</span>
    <h1>The journey so far</h1>
    <p>
      Every finished day is stamped by how it ended: gold for a marathon, colour for a landmark
      reached, grey for a day that fell short. A day is <em>collected</em> when you were there
      for it — the server counts the seconds, not this browser.
    </p>
    {sheet ? <PassportArchive days={sheet.days} /> : <p>The passport is unavailable right now.</p>}
    {journey ? <p className="passport-season-link">
      <Link href={`/season/${journey.seasonNumber}`}>See the whole Season {journey.seasonNumber} sheet →</Link>
    </p> : null}
  </main>;
}
