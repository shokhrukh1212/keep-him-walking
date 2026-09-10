import { registeredCountryPacks } from "@/content/countries/registry";
import { isVoteReadyPack, type CountryPackV3 } from "@/lib/content/schema";

export type TicketDestination = {
  packId: string;
  countryCode: string;
  countryName: string;
  cityName: string;
  timeZone: string;
  lat: number;
  lon: number;
  buildable: boolean;
};

/** The registry is the curated list; review or explicit owner opt-in makes a pack sellable. */
export function ticketDestinations(): TicketDestination[] {
  const byCountry = new Map<string, CountryPackV3>();
  for (const pack of registeredCountryPacks()) {
    if (pack.schemaVersion !== 3 || (!isVoteReadyPack(pack) && !pack.ticketBuildable)) continue;
    const previous = byCountry.get(pack.countryCode);
    if (!previous || pack.revision > previous.revision) byCountry.set(pack.countryCode, pack);
  }
  return [...byCountry.values()]
    .map((pack) => ({
      packId: pack.assetVersion,
      countryCode: pack.countryCode,
      countryName: pack.countryName,
      cityName: pack.cityName,
      timeZone: pack.timeZone,
      lat: pack.lat,
      lon: pack.lon,
      buildable: pack.ticketBuildable,
    }))
    .sort((a, b) => a.countryName.localeCompare(b.countryName));
}

export function ticketDestination(packId: string): TicketDestination | null {
  return ticketDestinations().find((destination) => destination.packId === packId) ?? null;
}
