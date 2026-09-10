import {
  countryPackV3Schema,
  stageSchema,
  DEFAULT_ZONE_KINDS,
  DEFAULT_ZONE_LENGTH_METRES,
  type CountryPackV3,
  type RouteProp,
  type RouteZone,
} from "@/lib/content/schema";


const TRAVELER_ROOT = "/traveler/production/v2";
const ACTION_ROOT = `${TRAVELER_ROOT}/actions`;

const CULTURAL_REVIEWS = {
  tashkent: {
    reviewerName: "Shokhrukh Karimov",
    reviewedAt: "2026-09-01T19:00:00.000Z",
    status: "approved" as const,
    qualification: "Uzbek resident familiar with Tashkent and Uzbek culture",
    disposition: "approved",
    publicLaunchRequirement: null,
    citations: [],
    notes: "Corrections: none currently requested.",
  },
  dushanbe: provisional("Dushanbe city tourism", "https://dushanbe-travel.tj/?lang=en"),
  bishkek: provisional("Bishkek City Hall — History of the city", "https://www.bishkek.gov.kg/en/history", "Kyrgyz Tourism Department", "https://tourism.gov.kg/tourist-sites/"),
  almaty: provisional("Kazakhstan Travel — Almaty", "https://www.kazakhstan.travel/en/regions/almaty"),
  baku: provisional("Azerbaijan Travel — Baku Old City", "https://azerbaijan.travel/explore-bakus-old-city", "Icherisheher State Reserve", "https://icherisheher.gov.az/en/activity/historical-reference"),
  tbilisi: provisional("Georgian National Tourism Administration — Tbilisi", "https://georgia.travel/cities-towns/tbilisi"),
  istanbul: provisional("GoTürkiye — İstanbul experiences", "https://goturkiye.com/istanbul/experiences"),
};

function provisional(title: string, url: string, secondTitle?: string, secondUrl?: string) {
  return {
    reviewerName: "Solo founder research review",
    reviewedAt: "2026-09-01T19:00:00.000Z",
    status: "creator_reviewed" as const,
    qualification: "Desk research using official tourism, city, museum and cultural-institution sources",
    disposition: "creator-reviewed and cleared for the destination vote",
    publicLaunchRequirement: "Qualified local review required before public launch",
    citations: [
      { title, url },
      ...(secondTitle && secondUrl ? [{ title: secondTitle, url: secondUrl }] : []),
    ],
    notes: "Provisional review covered architecture, clothing, food, landmarks, language, flags, religious imagery and dialogue. It is not native or local approval.",
  };
}

type ZoneDefinition = {
  stage?: Partial<RouteZone["stage"]>;
  id: string;
  label: string;
  weather: RouteZone["weather"];
  palette: [string, string, string];
};

export type Phase2CountryDefinition = {
  packId: string;
  countryCode: string;
  countryName: string;
  cityName: string;
  timeZone: string;
  lat?: number;
  lon?: number;
  neighbours?: string[];
  voteBlurb?: string;
  zones: [ZoneDefinition, ZoneDefinition, ZoneDefinition, ZoneDefinition, ZoneDefinition];
  encounter: {
    npcId: string;
    locationLabel: string;
    phrase: {
      original: string;
      transliteration: string;
      gloss: string;
      pronunciation: string;
    };
    exchange: [string, string, ...string[]];
    dialogue?: CountryPackV3["encounters"][number]["lines"];
  };
  resident?: { name: string; role: string; variantId: string };
  notebookLines?: string[];
  /** What the city does on its own; omitted cities get the quiet default. */
  ambient?: Partial<CountryPackV3["ambient"]>;
  postcardTitle: string;
  postcardCopy: string;
  sourceNotes: [string, string, ...string[]];
  culturalReview?: CountryPackV3["culturalReview"];
  assetBudgetBytes?: number;
  /** Asset switches emitted by P19 after it has inspected the owner's source files. */
  authoredAssets?: {
    nightZoneIds?: string[];
    lightsZoneIds?: string[];
  };
};

function routeProps(city: string, version: string, zoneId: string, authored = false): RouteProp[] {
  const root = `/scenes/${city}/${version}/props`;
  return [
    {
      id: `${zoneId}-tree`, kind: "tree", depth: 0.64, minGap: 900, maxGap: 1_260,
      colors: ["#38594c", "#d6a353"], ...(authored ? {} : { assetUrl: `${root}/${zoneId}-tree.webp` }),
    },
    {
      id: `${zoneId}-street-detail`, kind: "signpost", depth: 0.84, minGap: 680, maxGap: 980,
      colors: ["#234754", "#e6c77d"], ...(authored ? {} : { assetUrl: `${root}/${zoneId}-street-detail.webp` }),
    },
    {
      id: `${zoneId}-foreground`, kind: "planter", depth: 1.08, minGap: 760, maxGap: 1_080,
      colors: ["#2c6859", "#bf6b4e"], ...(authored ? {} : { assetUrl: `${root}/${zoneId}-foreground.webp` }),
    },
  ];
}

function routeZone(
  city: string,
  version: string,
  zone: ZoneDefinition,
  index: number,
  authoredAssets?: Phase2CountryDefinition["authoredAssets"],
): RouteZone {
  const root = `/scenes/${city}/${version}/zones/${zone.id}`;
  return {
    stage: stageSchema.parse(zone.stage ?? {}),
    id: zone.id,
    label: zone.label,
    lengthMetres: DEFAULT_ZONE_LENGTH_METRES[index] ?? DEFAULT_ZONE_LENGTH_METRES[DEFAULT_ZONE_LENGTH_METRES.length - 1],
    kind: DEFAULT_ZONE_KINDS[index] ?? DEFAULT_ZONE_KINDS[DEFAULT_ZONE_KINDS.length - 1],
    durationActiveSeconds: 150,
    // Schema-v3 zones are drawn as one coherent painting; the stacked parallax
    // crops that used to live here have not reached a screen since Phase 3, and
    // their files were removed in P18. Two layers are the schema minimum and
    // both name the painting the renderer actually uses.
    layers: [
      {
        id: "architecture", depth: 0.52, speed: 0.7, y: 0, height: 1,
        segments: [{ id: `${zone.id}-painting`, url: `${root}/fallback.webp`, worldWidth: 2_400 }],
      },
      {
        id: "ground", depth: 0.98, speed: 1, y: 0.76, height: 0.24,
        segments: [{ id: `${zone.id}-ground`, url: `${root}/fallback.webp`, worldWidth: 1_200 }],
      },
    ],
    props: routeProps(city, version, zone.id, Boolean(authoredAssets)),
    lighting: {
      skyTop: zone.palette[0],
      skyBottom: zone.palette[1],
      grade: zone.palette[2],
      intensity: 0.2 + index * 0.11,
    },
    weather: zone.weather,
    audioIds: authoredAssets ? [] : [`${city}-${zone.id}`],
    eventStage: {
      cameraPan: index % 2 === 0 ? 0.035 : -0.025,
      cameraZoom: 1.1,
      travelerAnchor: 0.59,
      npcAnchor: 0.78,
      backgroundLife: 0.4,
    },
    fallbackUrl: `${root}/fallback.webp`,
    ...(authoredAssets?.nightZoneIds?.includes(zone.id) ? { nightUrl: `${root}/night.webp` } : {}),
    ...(authoredAssets?.lightsZoneIds?.includes(zone.id) ? { lightsUrl: `${root}/lights.webp` } : {}),
  };
}

export function createPhase2CountryPack(definition: Phase2CountryDefinition): CountryPackV3 {
  const city = definition.packId.replace(/-v\d+$/, "");
  const version = definition.packId.match(/-(v\d+)$/)?.[1] ?? "v1";
  const zones = definition.zones.map((zone, index) => routeZone(city, version, zone, index, definition.authoredAssets));
  const encounterId = `${city}-welcome`;
  const firstZone = zones[0];
  const sceneRoot = `/scenes/${city}/${version}/zones/${firstZone.id}`;
  return countryPackV3Schema.parse({
    schemaVersion: 3,
    packId: definition.packId,
    revision: 1,
    ambient: definition.ambient ?? {},
    assetVersion: definition.packId,
    countryCode: definition.countryCode,
    countryName: definition.countryName,
    cityName: definition.cityName,
    timeZone: definition.timeZone,
    lat: definition.lat,
    lon: definition.lon,
    neighbours: definition.neighbours,
    voteBlurb: definition.voteBlurb,
    scene: {
      fallbackUrl: firstZone.fallbackUrl,
      layers: [
        { id: "distant", url: definition.authoredAssets ? firstZone.fallbackUrl : `${sceneRoot}/distant.webp`, depth: 0.14, speed: 0.035 },
        { id: "architecture", url: definition.authoredAssets ? firstZone.fallbackUrl : `${sceneRoot}/architecture.webp`, depth: 0.52, speed: 0.28 },
        { id: "ground", url: definition.authoredAssets ? firstZone.fallbackUrl : `${sceneRoot}/ground-1.webp`, depth: 0.98, speed: 1 },
      ],
      palette: {
        day: [definition.zones[0].palette[0], definition.zones[0].palette[1]],
        night: [definition.zones[4].palette[0], definition.zones[4].palette[2]],
      },
    },
    traveler: {
      // The only image a pack still needs: the frame that holds his place while
      // the GLB loads. Every other state is animated on the model.
      fallbackSprites: {
        loading: `${ACTION_ROOT}/idle.webp`,
        idle: `${ACTION_ROOT}/idle.webp`,
      },
    },
    npcAssets: definition.authoredAssets ? {} : {
      neutral: `/npcs/${city}/${version}/neutral.webp`,
      talk: `/npcs/${city}/${version}/talk.webp`,
      react: `/npcs/${city}/${version}/react.webp`,
    },
    npcSystem: {
      baseType: definition.resident?.variantId.includes("resident-b") || ["dushanbe", "almaty", "tbilisi"].includes(city) ? "resident-b" : "resident-a",
      variantId: definition.resident?.variantId ?? `${city}-${["dushanbe", "almaty", "tbilisi"].includes(city) ? "resident-b" : "resident-a"}`,
      states: definition.authoredAssets ? {} : {
        neutral: `/npcs/${city}/${version}/neutral.webp`,
        greet: `/npcs/${city}/${version}/talk.webp`,
        talk: `/npcs/${city}/${version}/talk.webp`,
        listen: `/npcs/${city}/${version}/neutral.webp`,
        react: `/npcs/${city}/${version}/react.webp`,
        goodbye: `/npcs/${city}/${version}/react.webp`,
      },
    },
    audio: definition.authoredAssets ? [] : zones.map((zone) => ({
      id: zone.audioIds[0],
      url: `/audio/${city}/${version}/${zone.id}.wav`,
      loop: true,
    })),
    ambientActions: [
      { state: "wave", label: "Waving to a passerby" },
      { state: "photo", label: "Saving a memory" },
      { state: "phone", label: "Checking the route" },
      { state: "drink", label: "Taking a short tea break" },
    ],
    encounters: [{
      id: encounterId,
      npcId: definition.encounter.npcId,
      locationLabel: definition.encounter.locationLabel,
      lines: definition.encounter.dialogue ?? [
        ...definition.encounter.exchange.map((text, index) => ({
          speaker: index % 2 === 0 ? "npc" as const : "traveler" as const,
          text,
          mood: (["curious", "amused", "thoughtful", "neutral"] as const)[index % 4],
        })),
      ],
    }],
    // The v3 renderer paints one coherent panorama per zone and no props, so the
    // ground crops and prop cutouts are never drawn and are not worth fetching.
    // The files stay on disk until P18 retires them.
    preload: [
      firstZone.fallbackUrl,
      `${ACTION_ROOT}/idle.webp`,
    ],
    route: { worldUnitsPerSecond: 92, travelerViewportAnchor: 0.61, zones },
    postcardBackgroundUrl: `/postcards/${city}/${version}/background.webp`,
    postcard: {
      title: definition.postcardTitle,
      safeCopy: definition.postcardCopy,
      focalPoint: { x: 0.68, y: 0.5 },
      textColor: "#fff8e8",
    },
    preloadGroups: [
      {
        id: `${city}-critical`, timing: "critical", zoneId: firstZone.id,
        assets: [firstZone.fallbackUrl],
      },
      ...zones.slice(1).map((zone) => ({
        id: `${city}-${zone.id}-next`, timing: "next_zone" as const, zoneId: zone.id,
        assets: zone.layers
          .filter((layer) => layer.id !== "ground")
          .flatMap((layer) => layer.segments.map((segment) => segment.url)),
      })),
    ],
    storyBeats: [
      { id: `${city}-arrival`, kind: "arrival", atMetres: 150, durationSeconds: 90, title: `Arrival in ${definition.cityName}`, summary: `The first steps through ${definition.zones[0].label}.` },
      { id: `${city}-encounter`, kind: "encounter", atMetres: 1_900, durationSeconds: 120, title: "A local welcome", summary: definition.encounter.phrase.gloss, encounterId },
      { id: `${city}-food`, kind: "food", atMetres: 4_800, durationSeconds: 120, title: definition.zones[3].label, summary: `A pause for the tastes and rituals of ${definition.cityName}.` },
      { id: `${city}-landmark`, kind: "landmark", atMetres: 7_900, durationSeconds: 150, title: definition.zones[4].label, summary: `The route opens onto one of ${definition.cityName}'s defining views.` },
      { id: `${city}-departure`, kind: "departure", atMetres: null, durationSeconds: 90, title: "Until tomorrow", summary: `The road turns toward the next country.` },
    ],
    localPhrases: [definition.encounter.phrase],
    culturalReview: definition.culturalReview ?? CULTURAL_REVIEWS[city as keyof typeof CULTURAL_REVIEWS] ?? {
      reviewerName: null,
      reviewedAt: null,
      status: "pending",
      qualification: null,
      disposition: null,
      publicLaunchRequirement: null,
      citations: [],
      notes: "Generated pack awaiting the owner's cultural-safety review.",
    },
    resident: definition.resident,
    notebookLines: definition.notebookLines,
    editorial: {
      owner: "Keep Him Walking editorial",
      researchedAt: "2026-09-02T00:00:00.000Z",
      sourceNotes: definition.sourceNotes,
    },
    assetBudgetBytes: definition.assetBudgetBytes ?? 5_767_168,
  });
}
