import type { MetadataRoute } from "next";
import { latestJourney } from "@/lib/season/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Only a season that actually ran is listed; an unrun number would 404.
  const journey = await latestJourney().catch(() => null);
  const seasons = journey ? [`/season/${journey.seasonNumber}`] : [];
  return ["", "/map", "/archive", ...seasons, "/sponsors", "/privacy", "/sponsor-terms", "/refund-policy", "/contact"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date("2026-09-04T00:00:00.000Z"),
    changeFrequency: path === "" ? "daily" as const : "monthly" as const,
    priority: path === "" ? 1 : 0.5,
  }));
}
