import { describe, expect, it } from "vitest";
import { postKitTemplates, type PostKitTemplateInput } from "./templates";

const base: PostKitTemplateInput = {
  dayNumber: 6,
  cityName: "Tbilisi",
  countryName: "Georgia",
  countryCode: "GE",
  distanceMetres: 31_400,
  landmarkReached: true,
  marathon: false,
  uniqueWatchers: 4_120,
  countriesCount: 61,
  topCountryName: "Georgia",
  topCountryCode: "GE",
  sponsorName: "Acme",
  tomorrowCountryName: "Armenia",
  tomorrowVote: [
    { label: "Armenia", code: "AM", votes: 52 },
    { label: "Türkiye", code: "TR", votes: 48 },
  ],
  sponsorPriceCents: 41_200,
  foundingPriceCents: 2_900,
};

describe("postKitTemplates", () => {
  it("renders the approved recap, vote, home-team and price facts", () => {
    const kit = postKitTemplates(base);
    expect(kit.recapText).toBe("Day 6 · Tbilisi. Landmark reached. 31.4 km. 4,120 watchers from 61 countries. 🇬🇪 Georgia carried him longest. Sponsored by Acme. Tomorrow: Armenia.");
    expect(kit.homeTeamText).toContain("🇬🇪 Georgia, this is your stamp.");
    expect(kit.voteText).toBe("Tomorrow: 🇦🇲 Armenia 52 — 🇹🇷 Türkiye 48. Closes 16:00 UTC.");
    expect(kit.priceText).toBe("Tomorrow's sponsor slot: $412. Day 1 was $29. Price is set by yesterday's watchers.");
  });

  it("keeps failed and marathon outcomes honest", () => {
    expect(postKitTemplates({ ...base, landmarkReached: false, distanceMetres: 6_100 }).recapText).toContain("He didn't reach the landmark. Grey stamp.");
    expect(postKitTemplates({ ...base, marathon: true, distanceMetres: 42_300 }).recapText).toContain("Marathon. 42.3 km.");
  });
});
