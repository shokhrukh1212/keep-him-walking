import "server-only";

import { shareImage } from "@/lib/share/image";
import type { SeasonSheet } from "./data";

/** The season poster: only totals the server has finalized. */
export function renderSeasonImage(sheet: SeasonSheet) {
  const km = (sheet.stats.confirmedDistanceMetres / 1_000).toFixed(1);
  return shareImage({
    eyebrow: `SEASON ${sheet.seasonNumber} · ${sheet.stats.days} ${sheet.stats.days === 1 ? "DAY" : "DAYS"}`,
    title: `${km} km across ${sheet.stats.countries} ${sheet.stats.countries === 1 ? "country" : "countries"}`,
    subtitle: sheet.stats.uniqueWatchers > 0
      ? `${sheet.stats.uniqueWatchers.toLocaleString()} people kept him walking`
      : "He is still waiting for his first watcher",
    stats: [
      `${sheet.stats.marathons} gold`,
      `${sheet.stats.landmarks} landmarks reached`,
    ],
    accent: sheet.stats.marathons > 0 ? "#ffe091" : "#8fd3ad",
  });
}
