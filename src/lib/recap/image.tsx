import "server-only";

import { flagEmoji } from "@/lib/countries/flags";
import { shareImage } from "@/lib/share/image";
import type { RecapDay } from "./data";

export function outcomeLabel(recap: Pick<RecapDay, "marathon" | "landmarkReached">) {
  return recap.marathon ? "MARATHON" : recap.landmarkReached ? "LANDMARK REACHED" : "UNFINISHED";
}

export function renderRecapImage(recap: RecapDay) {
  return shareImage({
    eyebrow: `DAY ${recap.dayNumber} · ${outcomeLabel(recap)}`,
    title: `${recap.cityName} · ${(recap.distanceMetres / 1_000).toFixed(1)} km`,
    subtitle: `${recap.uniqueWatchers.toLocaleString()} watchers from ${recap.countriesCount.toLocaleString()} countries`,
    stats: [
      `${flagEmoji(recap.countryCode)} ${recap.countryName}`,
      recap.marathon ? "Gold stamp" : recap.landmarkReached ? "Colour stamp" : "Grey stamp",
    ],
    accent: recap.marathon ? "#ffe091" : recap.landmarkReached ? "#8fd3ad" : "#b6bec0",
  });
}
