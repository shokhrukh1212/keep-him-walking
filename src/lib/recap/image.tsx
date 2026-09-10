import "server-only";

import { flagEmoji } from "@/lib/countries/flags";
import { stampFor, stampLabel } from "@/lib/outcomes/stamp";
import { shareImage } from "@/lib/share/image";
import type { RecapDay } from "./data";

export function outcomeLabel(recap: Pick<RecapDay, "marathon" | "landmarkReached">) {
  // A recap only exists for a finalized day, so the stamp is never null here.
  return stampLabel(stampFor({ outcome: recap, status: "completed" }));
}

/** The share card paints the stamp, so its colours live beside the stamp itself. */
const STAMP_ACCENT = { gold: "#ffe091", colour: "#8fd3ad", grey: "#b6bec0", current: "#fff7e5" } as const;
const STAMP_ACCENT_NAME = { gold: "Gold", colour: "Colour", grey: "Grey", current: "Live" } as const;

export function renderRecapImage(recap: RecapDay) {
  const stamp = stampFor({ outcome: recap, status: "completed" }) ?? "grey";
  return shareImage({
    eyebrow: `DAY ${recap.dayNumber} · ${outcomeLabel(recap)}`,
    title: `${recap.cityName} · ${(recap.distanceMetres / 1_000).toFixed(1)} km`,
    subtitle: `${recap.uniqueWatchers.toLocaleString()} watchers from ${recap.countriesCount.toLocaleString()} countries`,
    stats: [
      `${flagEmoji(recap.countryCode)} ${recap.countryName}`,
      `${STAMP_ACCENT_NAME[stamp]} stamp`,
    ],
    accent: STAMP_ACCENT[stamp],
  });
}
