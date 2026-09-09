import { UNKNOWN_COUNTRY_CODE } from "@/lib/countries/header";

const REGIONAL_INDICATOR_A = 0x1f1e6;
const LATIN_A = "A".charCodeAt(0);

/** The globe stands in for the unknown country, so a missing code never renders blank. */
export const UNKNOWN_COUNTRY_FLAG = "🌐";

/**
 * Renders a two-letter code as its flag emoji. The unknown code and anything
 * malformed render as a globe rather than as two stray indicator letters.
 */
export function flagEmoji(code: string | null | undefined): string {
  if (typeof code !== "string") return UNKNOWN_COUNTRY_FLAG;
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized) || normalized === UNKNOWN_COUNTRY_CODE) {
    return UNKNOWN_COUNTRY_FLAG;
  }
  return String.fromCodePoint(
    ...[...normalized].map((letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LATIN_A),
  );
}

/** Country names come from Intl, so no name table ships in the bundle. */
export function countryDisplayName(code: string | null | undefined): string {
  if (typeof code !== "string") return "Unknown";
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized) || normalized === UNKNOWN_COUNTRY_CODE) return "Unknown";
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" }).of(normalized);
    return display && display !== normalized ? display : normalized;
  } catch {
    return normalized;
  }
}

/** Carried watch time, as the leaderboard shows it. */
export function formatWatchDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
