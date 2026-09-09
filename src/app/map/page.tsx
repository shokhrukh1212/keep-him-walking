import type { Metadata } from "next";
import Link from "next/link";
import { JourneyMap } from "@/components/map/JourneyMap";
import { loadJourneyMap } from "@/lib/map/data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Journey map — Keep Him Walking",
  description: "The Season 1 route, completed city stamps, current city, and tomorrow's live vote.",
};

export default async function MapPage() {
  const data = await loadJourneyMap();
  return (
    <main className="content-page map-page">
      <Link className="back-link" href="/">← Return to the walk</Link>
      {data ? <JourneyMap data={data} /> : <p>The journey map is unavailable right now.</p>}
    </main>
  );
}
