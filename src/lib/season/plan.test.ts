import { describe, expect, it } from "vitest";
import { registeredCountryPacks } from "@/content/countries/registry";
import { ANNIVERSARY_JOURNEY } from "./anniversary";
import { buildAnniversaryPlan, buildSeasonPlan, parseSeasonStartsAt, planSeasonItinerary } from "./plan";

const now = Date.parse("2026-09-14T09:00:00Z");
const packs = registeredCountryPacks();

describe("parseSeasonStartsAt", () => {
  it("accepts only an explicit future whole UTC hour", () => {
    expect(parseSeasonStartsAt("2026-09-23T16:00:00Z", now).toISOString()).toBe("2026-09-23T16:00:00.000Z");
    expect(parseSeasonStartsAt("2026-09-17T00:00:00+05:00", now).toISOString()).toBe("2026-09-16T19:00:00.000Z");
    expect(() => parseSeasonStartsAt("2026-09-23T16:00:00", now)).toThrow(/UTC offset/);
    expect(() => parseSeasonStartsAt("2026-09-23T15:30:00Z", now)).toThrow(/whole UTC hour/);
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
      totalDays: 7,
      travelerName: null,
    });
    expect(plan.days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.days[0]?.arrivalMode).toBe("walk");
    expect(plan.days.at(-1)?.events.every((event) => event.startsAt === "2026-09-30T16:00:00.000Z")).toBe(true);
    expect(plan.votes).toEqual([expect.objectContaining({
      kind: "name",
      opensAt: "2026-09-23T16:00:00.000Z",
      closesAt: "2026-09-24T16:00:00.000Z",
    })]);
    expect(plan.votes[0]?.options.map((option) => option.label)).toEqual(["Milo", "Nur", "Sami", "Bek"]);
  });

  it("carries no ballot unless asked and never promises distinct countries it does not have", () => {
    const plan = buildSeasonPlan({ startsAt, seasonNumber: 2, itinerary, travelerName: "Nur" });
    expect(plan.votes).toEqual([]);
    expect(plan.season.travelerName).toBe("Nur");
    expect(plan.days.every((day) => ["walk", "train"].includes(day.arrivalMode))).toBe(true);
    expect(() => buildSeasonPlan({ startsAt, seasonNumber: 0, itinerary })).toThrow(/positive/);
    expect(() => buildSeasonPlan({ startsAt, seasonNumber: 3, itinerary: itinerary.slice(1) })).toThrow(/exactly 7/);
  });
});

describe("buildAnniversaryPlan", () => {
  const itinerary = ["paris-v3", "prague-v1", "bratislava-v1", "vienna-v1", "ljubljana-v1", "zagreb-v1", "belgrade-v1"]
    .map((id) => planSeasonItinerary({ packs, explicit: [id], cityCount: 1 })[0]!);
  const plan = buildAnniversaryPlan(itinerary);

  it("walks the seven configured cities two days each, from Tashkent midnight to the anniversary", () => {
    expect(plan.season).toMatchObject({
      slug: "season-1",
      title: "The Anniversary Journey",
      startsAt: "2026-09-16T19:00:00.000Z",
      endsAt: "2026-09-30T19:00:00.000Z",
      totalDays: 14,
    });
    expect(plan.season.startsAt).toBe(ANNIVERSARY_JOURNEY.travelStartsAt);
    expect(plan.season.endsAt).toBe(ANNIVERSARY_JOURNEY.travelEndsAt);
    expect(plan.days.map((day) => day.scenePackId)).toEqual(itinerary.flatMap((pack) => [pack.assetVersion, pack.assetVersion]));
    expect(plan.days.map((day) => day.dayNumber)).toEqual(Array.from({ length: 14 }, (_, index) => index + 1));
  });

  it("stays on foot inside a city and says goodbye only on the evening he leaves", () => {
    expect(plan.days.filter((_, index) => index % 2 === 1).every((day) => day.arrivalMode === "walk")).toBe(true);
    expect(plan.days.filter((_, index) => index % 2 === 0).every((day) => day.events.length === 0)).toBe(true);
    expect(plan.days[1]?.events.length).toBeGreaterThan(0);
    expect(plan.days[1]?.events.every((event) => event.startsAt === "2026-09-18T19:00:00.000Z")).toBe(true);
    expect(plan.days[13]?.events.every((event) => event.startsAt === "2026-09-30T19:00:00.000Z")).toBe(true);
  });

  it("runs the name vote from the preview day until launch and the poll from Day 8 until 20:00 on 28 September", () => {
    expect(plan.votes.map((vote) => [vote.kind, vote.opensAt, vote.closesAt])).toEqual([
      ["name", "2026-09-15T19:00:00.000Z", "2026-09-16T19:00:00.000Z"],
      ["anniversary", "2026-09-23T19:00:00.000Z", "2026-09-28T15:00:00.000Z"],
    ]);
    expect(plan.votes[1]?.options.map((option) => option.label)).toEqual(["A park in Tashkent", "A café in Tashkent", "A scenic spot in Tashkent"]);
  });

  it("refuses a poll outside the season", () => {
    expect(() => buildSeasonPlan({
      startsAt: new Date(ANNIVERSARY_JOURNEY.travelStartsAt), seasonNumber: 1, itinerary, daysPerCity: 2,
      poll: { question: "Q", options: ["a", "b"], opensAt: new Date("2026-09-15T19:00:00Z"), closesAt: new Date("2026-09-20T19:00:00Z") },
    })).toThrow(/within the season/);
  });
});
