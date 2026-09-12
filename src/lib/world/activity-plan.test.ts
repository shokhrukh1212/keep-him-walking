import { describe, expect, it } from "vitest";
import { parisCountryPackV1 } from "@/content/countries/paris.v1";
import { countryPackV3Schema, type CountryPackV3 } from "@/lib/content/schema";
import { OWN_ACTION_KINDS } from "./activities";
import {
  ACTION_PERIOD_SECONDS,
  CONVERSATION_PERIOD_SECONDS,
  GREETING_EVERY,
  STORY_CLEARANCE_SECONDS,
  actionSlotSecond,
  conversationSlotSecond,
  nextActivityToSchedule,
  ownActionKind,
  placeTagsOf,
  plannedActivitiesBetween,
  storyActivities,
} from "./activity-plan";
import { scenePositionAt } from "./route-clock";

const SEED = "10000000-0000-4000-8000-000000000123";

const line = (speaker: "npc" | "traveler", text: string) => ({ speaker, text, mood: "neutral" as const });

const pack: CountryPackV3 = countryPackV3Schema.parse({
  ...parisCountryPackV1,
  conversations: [
    { id: "story-welcome", role: "story", review: "approved", lines: parisCountryPackV1.encounters[0]!.lines },
    { id: "station-hello", review: "approved", placeTags: ["arrival"], lines: [line("npc", parisCountryPackV1.encounters[0]!.lines[0]!.text), line("traveler", "Yes.")] },
    { id: "canal-advice", review: "approved", placeTags: ["lanes", "arrival"], lines: [line("npc", "Follow the canal."), line("traveler", "I will.")] },
    { id: "market-peaches", review: "approved", placeTags: ["market"], lines: [line("npc", "Try the peaches."), line("traveler", "Merci!")] },
    { id: "cafe-slow", review: "approved", placeTags: ["cafe"], lines: [line("npc", "Nobody rushes here."), line("traveler", "Good.")] },
    { id: "river-books", review: "approved", placeTags: ["landmark"], lines: [line("npc", "The bookstalls open soon."), line("traveler", "Then I'll look.")] },
    { id: "anywhere-hello", review: "approved", lines: [line("npc", "Lovely afternoon."), line("traveler", "It really is.")] },
  ],
});

describe("activity slots", () => {
  it("places a conversation about every five walking minutes", () => {
    expect(conversationSlotSecond(SEED, 0)).toBeGreaterThanOrEqual(120);
    expect(conversationSlotSecond(SEED, 0)).toBeLessThanOrEqual(180);
    for (let index = 1; index < 60; index += 1) {
      const gap = conversationSlotSecond(SEED, index) - conversationSlotSecond(SEED, index - 1);
      expect(gap).toBeGreaterThanOrEqual(CONVERSATION_PERIOD_SECONDS - 60);
      expect(gap).toBeLessThanOrEqual(CONVERSATION_PERIOD_SECONDS + 60);
    }
  });

  it("places his own actions every four to six walking minutes, between conversations", () => {
    for (let index = 1; index < 60; index += 1) {
      const gap = actionSlotSecond(SEED, index) - actionSlotSecond(SEED, index - 1);
      expect(gap).toBeGreaterThanOrEqual(ACTION_PERIOD_SECONDS - 60);
      expect(gap).toBeLessThanOrEqual(ACTION_PERIOD_SECONDS + 60);
      for (let other = Math.max(0, index - 2); other < index + 2; other += 1) {
        expect(Math.abs(actionSlotSecond(SEED, index) - conversationSlotSecond(SEED, other))).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it("alternates drink and photo without an immediate repeat", () => {
    const kinds = Array.from({ length: OWN_ACTION_KINDS.length * 12 }, (_, index) => ownActionKind(SEED, index));
    for (let round = 0; round < 12; round += 1) {
      const start = round * OWN_ACTION_KINDS.length;
      expect(new Set(kinds.slice(start, start + OWN_ACTION_KINDS.length)).size).toBe(OWN_ACTION_KINDS.length);
    }
    for (let index = 1; index < kinds.length; index += 1) expect(kinds[index]).not.toBe(kinds[index - 1]);
  });

  it("is identical on every server and different for another day", () => {
    const day = (seed: string) => Array.from({ length: 27 }, (_, index) => ownActionKind(seed, index)).join(",");
    expect(day(SEED)).toBe(day(SEED));
    expect(day(SEED)).not.toBe(day("another-day"));
  });
});

describe("stories", () => {
  it("happen once, on the first visit to the place carrying their tag", () => {
    expect(storyActivities(pack).map(({ occurrenceKey, kind, walkingSecond, variant }) => ({ occurrenceKey, kind, walkingSecond, variant })))
      .toEqual([
        { occurrenceKey: "beat:paris-arrival", kind: "wave", walkingSecond: 20, variant: null },
        { occurrenceKey: "beat:paris-encounter", kind: "conversation", walkingSecond: 420 + 90, variant: "story-welcome" },
        { occurrenceKey: "beat:paris-food", kind: "drink", walkingSecond: 3 * 420 + 60, variant: null },
        { occurrenceKey: "beat:paris-landmark", kind: "photo", walkingSecond: 4 * 420 + 60, variant: null },
      ]);
  });

  it("are skipped where the manifest has no such place", () => {
    const noCafe = countryPackV3Schema.parse({
      ...pack,
      route: { ...pack.route, zones: pack.route.zones.filter((zone) => zone.kind !== "cafe") },
      preloadGroups: pack.preloadGroups.filter((group) => group.zoneId !== "paris-cafe"),
    });
    expect(storyActivities(noCafe).map((item) => item.occurrenceKey)).not.toContain("beat:paris-food");
  });
});

describe("the day's plan", () => {
  const planned = plannedActivitiesBetween(pack, SEED, 0, 6 * 3_600);

  it("gives way to stories and the daily stumble", () => {
    const blockers = planned.filter((item) => item.source === "beat" || item.kind === "stumble");
    expect(blockers.filter((item) => item.kind === "stumble")).toHaveLength(1);
    for (const item of planned) {
      if (blockers.includes(item)) continue;
      for (const blocker of blockers) {
        expect(Math.abs(item.walkingSecond - blocker.walkingSecond)).toBeGreaterThanOrEqual(STORY_CLEARANCE_SECONDS);
      }
    }
  });

  it("never repeats a script or its words back to back, and fits each script to its place", () => {
    const talks = planned.filter((item) => item.kind === "conversation");
    expect(talks.length).toBeGreaterThan(20);
    const scripts = new Map(pack.conversations.map((script) => [script.id, script]));
    for (let index = 1; index < talks.length; index += 1) {
      const previous = scripts.get(talks[index - 1]!.variant!)!;
      const current = scripts.get(talks[index]!.variant!)!;
      expect(current.id).not.toBe(previous.id);
      const words = new Set(previous.lines.map((entry) => entry.text));
      expect(current.lines.some((entry) => words.has(entry.text))).toBe(false);
    }
    for (const talk of talks.filter((item) => item.source === "system")) {
      const script = scripts.get(talk.variant!)!;
      const zone = pack.route.zones[scenePositionAt(pack, talk.walkingSecond).zoneIndex]!;
      if (script.placeTags.length > 0) expect(script.placeTags.some((tag) => placeTagsOf(zone).includes(tag))).toBe(true);
    }
  });

  it("makes every third conversation a wordless greeting", () => {
    for (const item of planned.filter((entry) => entry.occurrenceKey.startsWith("conversation:"))) {
      const index = Number(item.occurrenceKey.split(":")[1]);
      if (index % GREETING_EVERY === GREETING_EVERY - 1) expect(item.kind).toBe("greeting");
    }
    expect(planned.some((item) => item.kind === "greeting")).toBe(true);
  });
});

describe("nextActivityToSchedule", () => {
  const planned = plannedActivitiesBetween(pack, SEED, 1_000, 8_000);
  const target = planned.find((item, index) => item.source === "system"
    && (planned[index + 1]?.walkingSecond ?? Infinity) - item.walkingSecond > 90
    && item.walkingSecond - (planned[index - 1]?.walkingSecond ?? -Infinity) > 90)!;
  const base = {
    pack, seed: SEED, distanceMetres: 5_000, paceRate: 1, rows: [],
  };

  it("offers the next unwritten stop once it is inside the lead window", () => {
    const walkingSeconds = target.walkingSecond - 50;
    const candidate = nextActivityToSchedule({ ...base, walkingSeconds, globalActiveSeconds: walkingSeconds + 1_000 });
    expect(candidate).toMatchObject({ occurrenceKey: target.occurrenceKey, kind: target.kind, atActiveSecond: Math.ceil(walkingSeconds + 1_050) });
    expect(nextActivityToSchedule({ ...base, walkingSeconds: target.walkingSecond - 100, globalActiveSeconds: 2_000 })).toBeNull();
  });

  it("never writes the same occurrence twice, but re-offers one a crowd reaction displaced", () => {
    const walkingSeconds = target.walkingSecond - 50;
    const written = { kind: target.kind, atActiveSecond: 5, endsAtActiveSecond: 6, occurrenceKey: target.occurrenceKey };
    expect(nextActivityToSchedule({ ...base, walkingSeconds, globalActiveSeconds: 3_000, rows: [written] })).toBeNull();
    expect(nextActivityToSchedule({ ...base, walkingSeconds, globalActiveSeconds: 3_000, rows: [{ ...written, cancelled: true }] }))
      .toMatchObject({ occurrenceKey: target.occurrenceKey });
  });

  it("steps over a stop that is already written ahead of it", () => {
    const walkingSeconds = target.walkingSecond - 50;
    const crowdWave = { kind: "wave" as const, atActiveSecond: 3_010, endsAtActiveSecond: 3_015.93 };
    expect(nextActivityToSchedule({ ...base, walkingSeconds, globalActiveSeconds: 3_000, rows: [crowdWave] }))
      .toMatchObject({ occurrenceKey: target.occurrenceKey, atActiveSecond: Math.ceil(3_050 + 5.93) });
  });

  it("offers a marathon cheer once, only just after the distance is crossed", () => {
    const walkingSeconds = target.walkingSecond + 5;
    const near = { ...base, walkingSeconds, globalActiveSeconds: 9_000 };
    expect(nextActivityToSchedule({ ...near, distanceMetres: pack.marathonMetres + 10 }))
      .toMatchObject({ occurrenceKey: "cheer", kind: "cheer", atActiveSecond: 9_020 });
    expect(nextActivityToSchedule({ ...near, distanceMetres: pack.marathonMetres + 10, rows: [{ kind: "cheer", atActiveSecond: 1, endsAtActiveSecond: 2, occurrenceKey: "cheer" }] }))
      .toBeNull();
    expect(nextActivityToSchedule({ ...near, distanceMetres: pack.marathonMetres + 1_000 })).toBeNull();
  });
});
