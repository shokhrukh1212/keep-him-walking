import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { phase3EditorialBufferOrder, registeredCountryPacks } from "@/content/countries/registry";
import {
  countryPackV3Schema,
  DEFAULT_DAY_ROUTE_METRES,
  DEFAULT_MARATHON_METRES,
  DEFAULT_ZONE_LENGTH_METRES,
  DEFAULT_ZONE_KINDS,
} from "./schema";
import type { CountryPackV3 } from "./schema";

describe("Tashkent content pack", () => {
  it("satisfies the production-compatible asset contract", () => {
    expect(countryPackV3Schema.parse(tashkentCountryPackV4).assetVersion).toBe("tashkent-v4");
    expect(tashkentCountryPackV4.route.zones).toHaveLength(5);
    expect(tashkentCountryPackV4.route.zones.every((zone) => zone.layers.length >= 2)).toBe(true);
    expect(tashkentCountryPackV4.route.zones.every((zone) => zone.props.every((prop) => prop.assetUrl))).toBe(true);
    expect(tashkentCountryPackV4.ambientActions).toHaveLength(4);
    expect(tashkentCountryPackV4.encounters[0]?.lines).toHaveLength(4);
  });

  it("keeps dialogue outside animation files", () => {
    expect(tashkentCountryPackV4.encounters[0]?.lines.every((line) => line.text.length > 0)).toBe(true);
    // The GLB is the character; a pack carries only the frame that holds his
    // place while it loads.
    expect(tashkentCountryPackV4.traveler.fallbackSprites.idle).toMatch(/^\//);
  });

  it("rejects visitor-facing fields outside the allowed pack slots", () => {
    const unknownTopLevel = { ...tashkentCountryPackV4, visitorCaption: "unreviewed" };
    expect(() => countryPackV3Schema.parse(unknownTopLevel)).toThrow(/Unrecognized key/);
    const unknownDialogue = structuredClone(tashkentCountryPackV4);
    Object.assign(unknownDialogue.encounters[0]!.lines[0]!, { aside: "unreviewed" });
    expect(() => countryPackV3Schema.parse(unknownDialogue)).toThrow(/Unrecognized key/);
  });
});

describe("Phase 2 country packs", () => {
  const packs = registeredCountryPacks().filter((pack): pack is CountryPackV3 => pack.schemaVersion === 3 && !phase3EditorialBufferOrder.includes(pack.assetVersion as typeof phase3EditorialBufferOrder[number]));

  it("registers the immutable launch route and its Tashkent rollback", () => {
    expect(packs.map((pack) => pack.assetVersion)).toEqual([
      "tashkent-v4", "tashkent-v5", "dushanbe-v1", "bishkek-v1", "almaty-v1", "baku-v1", "tbilisi-v1", "istanbul-v1",
      "paris-v1", "paris-v2",
    ]);
    for (const pack of packs) expect(countryPackV3Schema.parse(pack)).toBeTruthy();
  });

  it("keeps environment ownership, cadence and review gates explicit", () => {
    const sceneUrls = packs.flatMap((pack) =>
      pack.route.zones.flatMap((zone) =>
        zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      ),
    );
    expect(new Set(sceneUrls).size).toBe(45);
    expect(packs.every((pack) => pack.storyBeats.length >= 4)).toBe(true);
    expect(packs.slice(0, 2).every((pack) => pack.culturalReview.status === "approved")).toBe(true);
    expect(packs.slice(2, -2).every((pack) => pack.culturalReview.status === "creator_reviewed")).toBe(true);
    expect(packs.slice(-2).every((pack) => pack.culturalReview.status === "pending")).toBe(true);
    expect(packs.slice(-2).every((pack) => pack.route.zones.every((zone) => zone.continuousScene))).toBe(true);
    expect(packs.at(-1)?.route.zones.every((zone) => zone.variants && zone.tags.length > 0)).toBe(true);
    expect(new Set(packs.map((pack) => pack.npcSystem.baseType))).toEqual(new Set(["resident-a", "resident-b"]));
  });

  it("upgrades legacy packs with the canonical distance defaults", () => {
    const legacy = structuredClone(packs[0]) as unknown as Record<string, unknown>;
    delete legacy.dayRouteMetres;
    delete legacy.marathonMetres;
    const route = legacy.route as { zones: Array<Record<string, unknown>> };
    route.zones.forEach((zone) => delete zone.lengthMetres);
    const beats = legacy.storyBeats as Array<Record<string, unknown>>;
    beats.forEach((beat, index) => {
      delete beat.atMetres;
      beat.atFraction = index / Math.max(1, beats.length - 1);
    });

    const parsed = countryPackV3Schema.parse(legacy);
    expect(parsed.dayRouteMetres).toBe(DEFAULT_DAY_ROUTE_METRES);
    expect(parsed.marathonMetres).toBe(DEFAULT_MARATHON_METRES);
    expect(parsed.route.zones.map((zone) => zone.lengthMetres)).toEqual(DEFAULT_ZONE_LENGTH_METRES);
    expect(parsed.storyBeats.map((beat) => beat.atMetres)).toEqual([150, 1_900, 4_800, 7_900, null]);
    expect(parsed.route.zones.every((zone) => zone.durationActiveSeconds > 0)).toBe(true);
  });
});

describe("Phase 3 editorial buffer", () => {
  const packs = phase3EditorialBufferOrder.map((packId) => registeredCountryPacks().find((pack) => pack.assetVersion === packId));

  it("registers seven unpublished, validated and distinct country packs", () => {
    expect(packs.every((pack) => pack?.schemaVersion === 3)).toBe(true);
    const typed = packs.filter((pack): pack is NonNullable<typeof pack> => Boolean(pack));
    expect(typed.map((pack) => pack.assetVersion)).toEqual(phase3EditorialBufferOrder);
    expect(typed.every((pack) => pack.schemaVersion === 3 && pack.route.zones.length === 5 && pack.culturalReview.status === "creator_reviewed")).toBe(true);
    expect(new Set(typed.map((pack) => pack.countryCode)).size).toBe(7);
  });
});

describe("zone kind", () => {
  it("names each zone by position so consumers stop matching city-specific ids", () => {
    for (const pack of registeredCountryPacks()) {
      expect(pack.route.zones.map((zone) => zone.kind))
        .toEqual(DEFAULT_ZONE_KINDS.slice(0, pack.route.zones.length));
    }
  });

  it("keeps an explicit kind when a pack declares one", () => {
    const source = JSON.parse(JSON.stringify(tashkentCountryPackV4)) as Record<string, unknown>;
    const route = source.route as { zones: Record<string, unknown>[] };
    route.zones[1].kind = "market";
    expect(countryPackV3Schema.parse(source).route.zones[1].kind).toBe("market");
  });
});

describe("continuous scene layers", () => {
  it("is optional for old packs and defaults the seamless pavement height", () => {
    expect(countryPackV3Schema.parse(tashkentCountryPackV4).route.zones[0]!.continuousScene)
      .toBeUndefined();
    const source = JSON.parse(JSON.stringify(tashkentCountryPackV4)) as Record<string, unknown>;
    const route = source.route as { zones: Record<string, unknown>[] };
    route.zones[0]!.continuousScene = {
      skyUrl: "/scenes/london/v1/arrival/sky.webp",
      cityUrl: "/scenes/london/v1/arrival/city.webp",
      groundUrl: "/scenes/london/v1/arrival/ground.webp",
    };
    expect(countryPackV3Schema.parse(source).route.zones[0]!.continuousScene)
      .toMatchObject({ groundHeightFrac: 0.22 });
  });
});

describe("variable place manifests", () => {
  function withPlaces(count: number) {
    const source = JSON.parse(JSON.stringify(tashkentCountryPackV4)) as Record<string, unknown>;
    const route = source.route as { zones: Record<string, unknown>[]; sceneVisitSeconds?: number };
    const template = route.zones;
    delete route.sceneVisitSeconds;
    route.zones = Array.from({ length: count }, (_, index) => {
      const zone = JSON.parse(JSON.stringify(template[index % template.length])) as Record<string, unknown>;
      delete zone.kind;
      delete zone.tags;
      return { ...zone, id: `place-${index}` };
    });
    source.preloadGroups = [
      { id: "critical", timing: "critical", zoneId: count > 0 ? "place-0" : undefined, assets: ["/scenes/a.webp"] },
      { id: "next", timing: "next_zone", assets: ["/scenes/b.webp"] },
    ];
    return source;
  }

  it("accepts an ordered manifest of one to twenty-four places", () => {
    for (const count of [1, 5, 10, 24]) {
      expect(countryPackV3Schema.parse(withPlaces(count)).route.zones).toHaveLength(count);
    }
    expect(() => countryPackV3Schema.parse(withPlaces(0))).toThrow();
    expect(() => countryPackV3Schema.parse(withPlaces(25))).toThrow();
  });

  it("refuses two places with the same id", () => {
    const source = withPlaces(3);
    (source.route as { zones: Record<string, unknown>[] }).zones[2]!.id = "place-0";
    expect(() => countryPackV3Schema.parse(source)).toThrow(/Place ids must be unique/);
  });

  it("defaults tags to the kind and each visit to seven walking minutes", () => {
    const parsed = countryPackV3Schema.parse(withPlaces(10));
    expect(parsed.route.sceneVisitSeconds).toBe(420);
    expect(parsed.route.zones[3]!.tags).toEqual(["cafe"]);
    expect(parsed.route.zones[7]!.tags).toEqual(["landmark"]);
  });

  it("keeps explicit tags, a description and content-addressed renditions", () => {
    const source = withPlaces(2);
    Object.assign((source.route as { zones: Record<string, unknown>[] }).zones[1]!, {
      tags: ["canal", "lanes"],
      description: "A quiet canal with an iron footbridge.",
      variants: {
        nominalWidth: 3_600,
        nominalHeight: 1_200,
        city: [{ url: "/scenes/paris/v2/places/p/city-full-1920.0123456789.webp", width: 1_920, height: 640, bytes: 190_000 }],
      },
    });
    const zone = countryPackV3Schema.parse(source).route.zones[1]!;
    expect(zone.tags).toEqual(["canal", "lanes"]);
    expect(zone.description).toBe("A quiet canal with an iron footbridge.");
    expect(zone.variants).toMatchObject({ city: [{ crop: "full" }], sky: [], ground: [], night: [] });
  });

  it("rejects duplicate conversation scripts", () => {
    const script = { id: "hello", lines: [{ speaker: "npc", text: "Hello.", mood: "neutral" }] };
    expect(() => countryPackV3Schema.parse({ ...tashkentCountryPackV4, conversations: [script, script] }))
      .toThrow(/Duplicate conversation/);
  });
});
