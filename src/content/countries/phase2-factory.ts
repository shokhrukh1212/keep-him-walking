import {
  countryPackV3Schema,
  type CountryPackV3,
  type RouteProp,
  type RouteZone,
} from "@/lib/content/schema";

export const PHASE2_RIVE_CONTRACT = {
  riveUrl: "/rive/traveler/v1/traveler.riv",
  artboard: "JourneyCharacter",
  stateMachine: "JourneyMachine",
  viewModel: "JourneyCharacterVM",
  requiredInputs: [
    "walking",
    "walkingSpeed",
    "action",
    "mood",
    "facingRight",
    "reducedMotion",
    "sponsorPatch",
  ] as const,
};

type ZoneDefinition = {
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
    exchange: [string, string, string, string];
  };
  postcardTitle: string;
  postcardCopy: string;
  sourceNotes: [string, string, ...string[]];
};

function routeProps(city: string, version: string, zoneId: string): RouteProp[] {
  const root = `/scenes/${city}/${version}/props`;
  return [
    {
      id: `${zoneId}-tree`, kind: "tree", depth: 0.64, minGap: 900, maxGap: 1_260,
      colors: ["#38594c", "#d6a353"], assetUrl: `${root}/${zoneId}-tree.webp`,
    },
    {
      id: `${zoneId}-street-detail`, kind: "signpost", depth: 0.84, minGap: 680, maxGap: 980,
      colors: ["#234754", "#e6c77d"], assetUrl: `${root}/${zoneId}-street-detail.webp`,
    },
    {
      id: `${zoneId}-foreground`, kind: "planter", depth: 1.08, minGap: 760, maxGap: 1_080,
      colors: ["#2c6859", "#bf6b4e"], assetUrl: `${root}/${zoneId}-foreground.webp`,
    },
  ];
}

function routeZone(city: string, version: string, zone: ZoneDefinition, index: number): RouteZone {
  const root = `/scenes/${city}/${version}/zones/${zone.id}`;
  return {
    id: zone.id,
    label: zone.label,
    durationActiveSeconds: 150,
    layers: [
      {
        id: "distant", depth: 0.14, speed: 0.035, y: 0, height: 1,
        segments: [{ id: `${zone.id}-distant`, url: `${root}/distant.webp`, worldWidth: 2_400 }],
      },
      {
        id: "architecture", depth: 0.52, speed: 0.28, y: 0.18, height: 0.68,
        segments: [{ id: `${zone.id}-architecture`, url: `${root}/architecture.webp`, worldWidth: 2_400 }],
      },
      {
        id: "ground", depth: 0.98, speed: 1, y: 0.76, height: 0.24,
        segments: [1, 2, 3].map((variant) => ({
          id: `${zone.id}-ground-${variant}`,
          url: `${root}/ground-${variant}.webp`,
          worldWidth: 1_200,
        })),
      },
    ],
    props: routeProps(city, version, zone.id),
    lighting: {
      skyTop: zone.palette[0],
      skyBottom: zone.palette[1],
      grade: zone.palette[2],
      intensity: 0.2 + index * 0.11,
    },
    weather: zone.weather,
    audioIds: [`${city}-${zone.id}`],
    eventStage: {
      cameraPan: index % 2 === 0 ? 0.035 : -0.025,
      cameraZoom: 1.1,
      travelerAnchor: 0.59,
      npcAnchor: 0.78,
      backgroundLife: 0.4,
    },
    fallbackUrl: `${root}/fallback.webp`,
  };
}

export function createPhase2CountryPack(definition: Phase2CountryDefinition): CountryPackV3 {
  const city = definition.packId.replace(/-v\d+$/, "");
  const version = definition.packId.match(/-(v\d+)$/)?.[1] ?? "v1";
  const zones = definition.zones.map((zone, index) => routeZone(city, version, zone, index));
  const encounterId = `${city}-welcome`;
  const firstZone = zones[0];
  const sceneRoot = `/scenes/${city}/${version}/zones/${firstZone.id}`;
  return countryPackV3Schema.parse({
    schemaVersion: 3,
    packId: definition.packId,
    revision: 1,
    assetVersion: definition.packId,
    countryCode: definition.countryCode,
    countryName: definition.countryName,
    cityName: definition.cityName,
    timeZone: definition.timeZone,
    scene: {
      fallbackUrl: firstZone.fallbackUrl,
      layers: [
        { id: "distant", url: `${sceneRoot}/distant.webp`, depth: 0.14, speed: 0.035 },
        { id: "architecture", url: `${sceneRoot}/architecture.webp`, depth: 0.52, speed: 0.28 },
        { id: "ground", url: `${sceneRoot}/ground-1.webp`, depth: 0.98, speed: 1 },
      ],
      palette: {
        day: [definition.zones[0].palette[0], definition.zones[0].palette[1]],
        night: [definition.zones[4].palette[0], definition.zones[4].palette[2]],
      },
    },
    traveler: {
      ...PHASE2_RIVE_CONTRACT,
      fallbackSprites: {
        loading: "/traveler/temporary/v1/idle.webp",
        idle: "/traveler/temporary/v1/idle.webp",
        start_walk: "/traveler/temporary/v2/walk-1.webp",
        walk: "/traveler/temporary/v2/walk-3.webp",
        slow_walk: "/traveler/temporary/v2/walk-7.webp",
        stop: "/traveler/temporary/v2/walk-8.webp",
        rest: "/traveler/temporary/v1/idle.webp",
        notice: "/traveler/temporary/v1/phone.webp",
        approach: "/traveler/temporary/v2/walk-2.webp",
        greet: "/traveler/temporary/v1/wave.webp",
        talk: "/traveler/temporary/v1/wave.webp",
        listen: "/traveler/temporary/v1/idle.webp",
        react: "/traveler/temporary/v1/wave.webp",
        wave: "/traveler/temporary/v1/wave.webp",
        phone: "/traveler/temporary/v1/phone.webp",
        drink: "/traveler/temporary/v1/drink.webp",
        photo: "/traveler/temporary/v1/photo.webp",
        sit: "/traveler/temporary/v1/idle.webp",
        goodbye: "/traveler/temporary/v1/wave.webp",
        resume_walk: "/traveler/temporary/v2/walk-1.webp",
      },
      walkCycle: {
        frames: Array.from({ length: 8 }, (_, index) => `/traveler/temporary/v2/walk-${index + 1}.webp`),
        framesPerSecond: 10,
      },
    },
    npcAssets: {
      neutral: `/npcs/${city}/${version}/neutral.webp`,
      talk: `/npcs/${city}/${version}/talk.webp`,
      react: `/npcs/${city}/${version}/react.webp`,
    },
    audio: zones.map((zone) => ({
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
      lines: [
        { speaker: "npc", text: definition.encounter.exchange[0], mood: "curious" },
        { speaker: "traveler", text: definition.encounter.exchange[1], mood: "amused" },
        { speaker: "npc", text: definition.encounter.exchange[2], mood: "thoughtful" },
        { speaker: "traveler", text: definition.encounter.exchange[3], mood: "neutral" },
      ],
    }],
    preload: [
      `${sceneRoot}/distant.webp`,
      `${sceneRoot}/architecture.webp`,
      `${sceneRoot}/ground-1.webp`,
      `/traveler/temporary/v2/walk-1.webp`,
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
        assets: [`${sceneRoot}/distant.webp`, `${sceneRoot}/architecture.webp`, `${sceneRoot}/ground-1.webp`],
      },
      ...zones.slice(1).map((zone) => ({
        id: `${city}-${zone.id}-next`, timing: "next_zone" as const, zoneId: zone.id,
        assets: zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      })),
    ],
    storyBeats: [
      { id: `${city}-arrival`, kind: "arrival", atFraction: 0.02, durationSeconds: 90, title: `Arrival in ${definition.cityName}`, summary: `The first steps through ${definition.zones[0].label}.` },
      { id: `${city}-encounter`, kind: "encounter", atFraction: 0.23, durationSeconds: 120, title: "A local welcome", summary: definition.encounter.phrase.gloss, encounterId },
      { id: `${city}-food`, kind: "food", atFraction: 0.48, durationSeconds: 120, title: definition.zones[3].label, summary: `A pause for the tastes and rituals of ${definition.cityName}.` },
      { id: `${city}-landmark`, kind: "landmark", atFraction: 0.72, durationSeconds: 150, title: definition.zones[4].label, summary: `The route opens onto one of ${definition.cityName}'s defining views.` },
      { id: `${city}-departure`, kind: "departure", atFraction: 0.94, durationSeconds: 90, title: "Until tomorrow", summary: `The road turns toward the next country.` },
    ],
    localPhrases: [definition.encounter.phrase],
    culturalReview: {
      reviewerName: null,
      reviewedAt: null,
      status: "pending",
      notes: "External local cultural review is required before scheduling or launch.",
    },
    editorial: {
      owner: "Keep Him Walking editorial",
      researchedAt: "2026-09-02T00:00:00.000Z",
      sourceNotes: definition.sourceNotes,
    },
    assetBudgetBytes: 5_767_168,
  });
}
