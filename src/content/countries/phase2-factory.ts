import {
  countryPackV3Schema,
  stageSchema,
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

const TRAVELER_ROOT = "/traveler/production/v2";
const ACTION_ROOT = `${TRAVELER_ROOT}/actions`;
const WALK_ROOT = `${TRAVELER_ROOT}/walk`;

function frameMetadata(index = 0, moving = false) {
  const phase = index % 6;
  const leftPlanted = moving && phase === 0;
  const rightPlanted = moving && phase === 3;
  const sponsorX = [0.365, 0.35, 0.34, 0.36, 0.35, 0.34][phase] ?? 0.35;
  const sponsorY = [0.39, 0.385, 0.38, 0.39, 0.385, 0.38][phase] ?? 0.385;
  return {
    leftFoot: { x: leftPlanted ? 0.48 : 0.44, y: leftPlanted ? 0.99 : 0.94, planted: leftPlanted },
    rightFoot: { x: rightPlanted ? 0.52 : 0.56, y: rightPlanted ? 0.99 : 0.94, planted: rightPlanted },
    rootX: 0,
    rootY: moving ? [0, -0.004, -0.008, 0, -0.004, -0.008][phase] : 0,
    shadowScale: moving ? [1, 0.95, 0.91, 1, 0.95, 0.91][phase] : 1,
    sponsorAnchor: {
      x: moving ? sponsorX : 0.35,
      y: moving ? sponsorY : 0.385,
      scale: 0.105,
      rotation: moving ? [-2, -1, 1, 2, 1, -1][phase] : 0,
    },
  };
}

function clip(frames: string[], framesPerSecond: number, loop: boolean, moving = false, strideWorldUnits?: number) {
  return {
    frames,
    framesPerSecond,
    loop,
    ...(strideWorldUnits ? { strideWorldUnits } : {}),
    metadata: frames.map((_, index) => frameMetadata(index, moving)),
  };
}

function productionSpriteManifest() {
  const action = (name: string) => `${ACTION_ROOT}/${name}.webp`;
  // The high-resolution source includes two exaggerated knee-up poses. Keep
  // them available for future transition work, but omit them from the calm
  // route gait so the live loop reads as an adult walk rather than a skip.
  const walk = [1, 2, 4, 5, 6, 8].map((index) => `${WALK_ROOT}/walk-${index}.webp`);
  return {
    version: 1 as const,
    canvas: { width: 540, height: 960, groundY: 0.99 },
    maxDecodedCacheBytes: 32 * 1_048_576,
    clips: {
      loading: clip([action("idle")], 1, true),
      idle: clip([action("idle"), action("idle-alt")], 0.25, true),
      start_walk: clip(walk, 5, true, true, 92),
      walk: clip(walk, 5, true, true, 92),
      slow_walk: clip(walk, 5, true, true, 92),
      stop: clip([action("stop")], 1, false),
      rest: clip([action("rest"), action("idle-alt")], 0.25, true),
      notice: clip([action("notice")], 1, false),
      approach: clip(walk, 5, true, true, 92),
      greet: clip([action("wave")], 1, false),
      talk: clip([action("talk")], 1, true),
      listen: clip([action("listen")], 1, true),
      react: clip([action("react")], 1, false),
      wave: clip([action("wave")], 1, true),
      phone: clip([action("phone")], 1, true),
      drink: clip([action("drink")], 1, true),
      photo: clip([action("photo")], 1, true),
      sit: clip([action("rest")], 1, false),
      goodbye: clip([action("goodbye")], 1, false),
      resume_walk: clip(walk, 5, true, true, 92),
    },
  };
}

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
    status: "provisional_preview" as const,
    qualification: "Desk research using official tourism, city, museum and cultural-institution sources",
    disposition: "provisionally approved for private preview",
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
  culturalReview?: CountryPackV3["culturalReview"];
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
    stage: stageSchema.parse(zone.stage ?? {}),
    id: zone.id,
    label: zone.label,
    lengthMetres: [1_200, 1_600, 1_600, 1_400, 2_200][index] ?? 2_200,
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
      driver: "sprite",
      ...PHASE2_RIVE_CONTRACT,
      fallbackSprites: {
        loading: `${ACTION_ROOT}/idle.webp`,
        idle: `${ACTION_ROOT}/idle.webp`,
        start_walk: `${WALK_ROOT}/walk-1.webp`,
        walk: `${WALK_ROOT}/walk-1.webp`,
        slow_walk: `${WALK_ROOT}/walk-6.webp`,
        stop: `${ACTION_ROOT}/stop.webp`,
        rest: `${ACTION_ROOT}/rest.webp`,
        notice: `${ACTION_ROOT}/notice.webp`,
        approach: `${WALK_ROOT}/walk-2.webp`,
        greet: `${ACTION_ROOT}/wave.webp`,
        talk: `${ACTION_ROOT}/talk.webp`,
        listen: `${ACTION_ROOT}/listen.webp`,
        react: `${ACTION_ROOT}/react.webp`,
        wave: `${ACTION_ROOT}/wave.webp`,
        phone: `${ACTION_ROOT}/phone.webp`,
        drink: `${ACTION_ROOT}/drink.webp`,
        photo: `${ACTION_ROOT}/photo.webp`,
        sit: `${ACTION_ROOT}/rest.webp`,
        goodbye: `${ACTION_ROOT}/goodbye.webp`,
        resume_walk: `${ACTION_ROOT}/resume-walk.webp`,
      },
      walkCycle: {
        frames: [1, 2, 4, 5, 6, 8].map((index) => `${WALK_ROOT}/walk-${index}.webp`),
        framesPerSecond: 5,
      },
      spriteManifest: productionSpriteManifest(),
    },
    npcAssets: {
      neutral: `/npcs/${city}/${version}/neutral.webp`,
      talk: `/npcs/${city}/${version}/talk.webp`,
      react: `/npcs/${city}/${version}/react.webp`,
    },
    npcSystem: {
      baseType: ["dushanbe", "almaty", "tbilisi"].includes(city) ? "resident-b" : "resident-a",
      variantId: `${city}-${["dushanbe", "almaty", "tbilisi"].includes(city) ? "resident-b" : "resident-a"}`,
      states: {
        neutral: `/npcs/${city}/${version}/neutral.webp`,
        greet: `/npcs/${city}/${version}/talk.webp`,
        talk: `/npcs/${city}/${version}/talk.webp`,
        listen: `/npcs/${city}/${version}/neutral.webp`,
        react: `/npcs/${city}/${version}/react.webp`,
        goodbye: `/npcs/${city}/${version}/react.webp`,
      },
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
    // The v3 renderer paints one coherent panorama per zone and no props, so the
    // ground crops and prop cutouts are never drawn and are not worth fetching.
    // The files stay on disk until P18 retires them.
    preload: [
      `${sceneRoot}/distant.webp`,
      `${sceneRoot}/architecture.webp`,
      `${WALK_ROOT}/walk-1.webp`,
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
        assets: [`${sceneRoot}/distant.webp`, `${sceneRoot}/architecture.webp`],
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
    culturalReview: definition.culturalReview ?? CULTURAL_REVIEWS[city as keyof typeof CULTURAL_REVIEWS],
    editorial: {
      owner: "Keep Him Walking editorial",
      researchedAt: "2026-09-02T00:00:00.000Z",
      sourceNotes: definition.sourceNotes,
    },
    assetBudgetBytes: 5_767_168,
  });
}
