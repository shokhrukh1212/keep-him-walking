import { describe, expect, it } from "vitest";
import { registeredCountryPacks } from "@/content/countries/registry";
import { buildSeasonPlan, parseSeasonStartsAt, planSeasonItinerary } from "./plan";

const now = Date.parse("2026-09-14T09:00:00Z");
const packs = registeredCountryPacks();

describe("parseSeasonStartsAt", () => {
  it("accepts only an explicit future 16:00 UTC boundary", () => {
    expect(parseSeasonStartsAt("2026-09-23T16:00:00Z", now).toISOString()).toBe("2026-09-23T16:00:00.000Z");
    expect(parseSeasonStartsAt("2026-09-23T18:00:00+02:00", now).toISOString()).toBe("2026-09-23T16:00:00.000Z");
    expect(() => parseSeasonStartsAt("2026-09-23T16:00:00", now)).toThrow(/UTC offset/);
    expect(() => parseSeasonStartsAt("2026-09-23T15:00:00Z", now)).toThrow(/16:00 UTC/);
    expect(() => parseSeasonStartsAt("2026-09-13T16:00:00Z", now)).toThrow(/before it starts/);
  });
});

describe("planSeasonItinerary", () => {
  it("starts in Paris and follows the route rule to seven different cities", () => {
    const itinerary = planSeasonItinerary({ packs });
    expect(itinerary).toHaveLength(7);
    expect(itinerary[0]?.assetVersion).toBe("paris-v3");
    expect(new Set(itinerary.map((pack) => pack.cityName)).size).toBe(7);
    expect(new Set(itinerary.map((pack) => pack.assetVersion)).size).toBe(7);
    for (const pack of itinerary) expect(["approved", "creator_reviewed"]).toContain(pack.culturalReview.status);
  });

  it("uses each city's actual manifest length rather than a fixed scene count", () => {
    const lengths = new Set(planSeasonItinerary({ packs }).map((pack) => pack.route.zones.length));
    expect([...lengths].every((length) => length >= 1 && length <= 24)).toBe(true);
  });

  it("takes an explicit itinerary as written and refuses repeats, gaps and unready packs", () => {
    const planned = planSeasonItinerary({ packs }).map((pack) => pack.assetVersion);
    expect(planSeasonItinerary({ packs, explicit: planned }).map((pack) => pack.assetVersion)).toEqual(planned);
    expect(() => planSeasonItinerary({ packs, explicit: planned.slice(0, 6) })).toThrow(/exactly 7/);
    expect(() => planSeasonItinerary({ packs, explicit: [...planned.slice(0, 6), planned[0]!] })).toThrow(/different city/);
    expect(() => planSeasonItinerary({ packs, explicit: [...planned.slice(0, 6), "nowhere-v1"] })).toThrow(/not a registered/);
  });

  it("refuses to invent a week when too few ready cities are reachable", () => {
    const small = packs.filter((pack) => ["paris-v3", "prague-v1"].includes(pack.assetVersion));
    expect(() => planSeasonItinerary({ packs: small })).toThrow(/Only 2 ready cities/);
  });
});

describe("buildSeasonPlan", () => {
  const startsAt = new Date("2026-09-23T16:00:00Z");
  const itinerary = planSeasonItinerary({ packs });

  it("ends exactly seven days later with one day per 24 hours", () => {
    const plan = buildSeasonPlan({ startsAt, seasonNumber: 1, itinerary, nameBallot: true });
    expect(plan.season).toMatchObject({
      slug: "season-1",
      title: "Season 1",
      startsAt: "2026-09-23T16:00:00.000Z",
      endsAt: "2026-09-30T16:00:00.000Z",
      travelerName: null,
    });
    expect(plan.days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.days[0]?.arrivalMode).toBe("walk");
    expect(plan.days.at(-1)?.events.every((event) => event.startsAt === "2026-09-30T16:00:00.000Z")).toBe(true);
    expect(plan.vote?.options.map((option) => option.label)).toEqual(["Milo", "Nur", "Sami", "Bek"]);
  });

  it("carries no ballot unless asked and never promises distinct countries it does not have", () => {
    const plan = buildSeasonPlan({ startsAt, seasonNumber: 2, itinerary, travelerName: "Nur" });
    expect(plan.vote).toBeNull();
    expect(plan.season.travelerName).toBe("Nur");
    expect(plan.days.every((day) => ["walk", "train"].includes(day.arrivalMode))).toBe(true);
    expect(() => buildSeasonPlan({ startsAt, seasonNumber: 0, itinerary })).toThrow(/positive/);
    expect(() => buildSeasonPlan({ startsAt, seasonNumber: 3, itinerary: itinerary.slice(1) })).toThrow(/exactly 7/);
  });
});
