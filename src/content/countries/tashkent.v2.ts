import { countryPackSchema, type RouteProp } from "@/lib/content/schema";
import {
  PHASE1_COUNTRY_DAY_ID,
  PHASE1_ENCOUNTER_ID,
} from "./tashkent.v1";

const zoneRoot = "/scenes/tashkent/v2/zones";
const zoneIds = [
  "arrival-boulevard",
  "mahalla-street",
  "chorsu-market",
  "plov-cafe",
  "evening-landmark",
] as const;

const zoneLabels: Record<(typeof zoneIds)[number], string> = {
  "arrival-boulevard": "Arrival boulevard",
  "mahalla-street": "Mahalla street",
  "chorsu-market": "Chorsu market",
  "plov-cafe": "Plov café",
  "evening-landmark": "Evening canal",
};

const zoneLighting: Record<
  (typeof zoneIds)[number],
  { skyTop: string; skyBottom: string; grade: string; intensity: number }
> = {
  "arrival-boulevard": {
    skyTop: "#79c6da",
    skyBottom: "#f4d8a1",
    grade: "#f0bd68",
    intensity: 0.22,
  },
  "mahalla-street": {
    skyTop: "#8ac9d5",
    skyBottom: "#efd29c",
    grade: "#e5ad5e",
    intensity: 0.18,
  },
  "chorsu-market": {
    skyTop: "#75bfd1",
    skyBottom: "#f6cf88",
    grade: "#e6a64e",
    intensity: 0.2,
  },
  "plov-cafe": {
    skyTop: "#78b7c4",
    skyBottom: "#efbd75",
    grade: "#dc8d46",
    intensity: 0.25,
  },
  "evening-landmark": {
    skyTop: "#4c7197",
    skyBottom: "#e7845f",
    grade: "#c76551",
    intensity: 0.3,
  },
};

const propsByZone: Record<(typeof zoneIds)[number], RouteProp[]> = {
  "arrival-boulevard": [
    { id: "arrival-tree", kind: "tree", depth: 0.78, minGap: 620, maxGap: 940, colors: ["#3f744f", "#d9a33e"] },
    { id: "arrival-lamp", kind: "lamp", depth: 0.9, minGap: 460, maxGap: 720, colors: ["#183a43", "#f6d78c"] },
    { id: "arrival-planter", kind: "planter", depth: 1, minGap: 380, maxGap: 620, colors: ["#b87846", "#54835a"] },
  ],
  "mahalla-street": [
    { id: "mahalla-vine", kind: "tree", depth: 0.72, minGap: 520, maxGap: 780, colors: ["#547f46", "#e2b64d"] },
    { id: "mahalla-bench", kind: "bench", depth: 0.95, minGap: 650, maxGap: 980, colors: ["#795138", "#b57a4b"] },
    { id: "mahalla-planter", kind: "planter", depth: 1.05, minGap: 340, maxGap: 560, colors: ["#9d643b", "#477f54"] },
  ],
  "chorsu-market": [
    { id: "market-awning", kind: "awning", depth: 0.68, minGap: 440, maxGap: 680, colors: ["#2789a1", "#e5a33f"] },
    { id: "market-stall", kind: "stall", depth: 0.92, minGap: 520, maxGap: 760, colors: ["#c77b38", "#266e87", "#f0c76e"] },
    { id: "market-lamp", kind: "lamp", depth: 1.02, minGap: 600, maxGap: 900, colors: ["#173943", "#f7da8d"] },
  ],
  "plov-cafe": [
    { id: "cafe-awning", kind: "awning", depth: 0.72, minGap: 480, maxGap: 720, colors: ["#986040", "#d7a546"] },
    { id: "cafe-bench", kind: "bench", depth: 0.94, minGap: 420, maxGap: 660, colors: ["#70472f", "#c78b4d"] },
    { id: "cafe-planter", kind: "planter", depth: 1.04, minGap: 330, maxGap: 520, colors: ["#a7623b", "#598250"] },
  ],
  "evening-landmark": [
    { id: "evening-tree", kind: "tree", depth: 0.74, minGap: 680, maxGap: 980, colors: ["#244d49", "#b8783c"] },
    { id: "evening-lamp", kind: "lamp", depth: 0.96, minGap: 380, maxGap: 600, colors: ["#102f3b", "#ffd88a"] },
    { id: "evening-bench", kind: "bench", depth: 1.03, minGap: 620, maxGap: 900, colors: ["#523a36", "#a96d48"] },
  ],
};

function layer(
  zoneId: (typeof zoneIds)[number],
  id: "distant" | "architecture" | "ground",
  depth: number,
  speed: number,
  y: number,
  height: number,
) {
  return {
    id,
    depth,
    speed,
    y,
    height,
    segments: [1, 2, 3].map((variant) => ({
      id: `${zoneId}-${id}-${variant}`,
      url: `${zoneRoot}/${zoneId}/${id}-${variant}.webp`,
      worldWidth: 1_024,
    })),
  };
}

export const tashkentCountryPackV2 = countryPackSchema.parse({
  schemaVersion: 2,
  assetVersion: "tashkent-v2",
  countryDayId: PHASE1_COUNTRY_DAY_ID,
  countryCode: "UZ",
  countryName: "Uzbekistan",
  cityName: "Tashkent",
  timeZone: "Asia/Tashkent",
  scene: {
    fallbackUrl: `${zoneRoot}/arrival-boulevard/fallback.webp`,
    layers: [
      { id: "sky", url: `${zoneRoot}/arrival-boulevard/distant-1.webp`, depth: 0.08, speed: 0.08 },
      { id: "city", url: `${zoneRoot}/arrival-boulevard/architecture-1.webp`, depth: 0.46, speed: 0.42 },
      { id: "street", url: `${zoneRoot}/arrival-boulevard/ground-1.webp`, depth: 0.9, speed: 1 },
    ],
    palette: {
      day: ["#79c6da", "#f4d8a1", "#d97850"],
      night: ["#172d42", "#425a78", "#d77a52"],
    },
  },
  route: {
    worldUnitsPerSecond: 120,
    travelerViewportAnchor: 0.6,
    zones: zoneIds.map((zoneId, index) => ({
      id: zoneId,
      label: zoneLabels[zoneId],
      durationActiveSeconds: 120,
      layers: [
        layer(zoneId, "distant", 0.12, 0.12, 0.16, 0.34),
        layer(zoneId, "architecture", 0.5, 0.44, 0.43, 0.38),
        layer(zoneId, "ground", 0.92, 1, 0.76, 0.24),
      ],
      props: propsByZone[zoneId],
      lighting: zoneLighting[zoneId],
      weather: (["clear", "breeze", "haze", "golden", "evening"] as const)[index],
      audioIds: [`tashkent-${zoneId}`],
      eventStage: {
        cameraPan: -0.035,
        cameraZoom: 1.08,
        travelerAnchor: 0.56,
        npcAnchor: 0.78,
        backgroundLife: 0.22,
      },
      fallbackUrl: `${zoneRoot}/${zoneId}/fallback.webp`,
    })),
  },
  traveler: {
    riveUrl: null,
    artboard: "Traveler",
    stateMachine: "TravelerState",
    walkCycle: {
      frames: Array.from({ length: 8 }, (_, index) => `/traveler/temporary/v2/walk-${index + 1}.webp`),
      framesPerSecond: 10,
    },
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
  },
  npcAssets: {
    neutral: "/npcs/tashkent/v2/neutral.webp",
    talk: "/npcs/tashkent/v2/talk.webp",
    react: "/npcs/tashkent/v2/react.webp",
  },
  audio: zoneIds.map((zoneId) => ({
    id: `tashkent-${zoneId}`,
    url: `/audio/tashkent/v2/${zoneId}.wav`,
    loop: true,
  })),
  ambientActions: [
    { state: "wave", label: "Waving to a passerby" },
    { state: "phone", label: "Checking the route" },
    { state: "drink", label: "Taking a water break" },
    { state: "photo", label: "Photographing the city" },
  ],
  encounters: [
    {
      id: PHASE1_ENCOUNTER_ID,
      npcId: "tashkent-chef",
      locationLabel: "Chorsu market · Plov lane",
      lines: [
        { speaker: "traveler", mood: "curious", text: "Excuse me—what should I try while I’m in Tashkent?", durationMs: 5_500 },
        { speaker: "npc", mood: "surprised", text: "You haven’t eaten plov yet?", durationMs: 4_500 },
        { speaker: "traveler", mood: "amused", text: "Not yet. Is that a problem?", durationMs: 4_800 },
        { speaker: "npc", mood: "amused", text: "A very serious problem. Follow me.", durationMs: 5_200 },
      ],
      nextStoryBeatId: "visit-plov-cafe",
    },
  ],
  postcardBackgroundUrl: "/postcards/tashkent/v2/background.webp",
  preload: [
    `${zoneRoot}/arrival-boulevard/distant-1.webp`,
    `${zoneRoot}/arrival-boulevard/architecture-1.webp`,
    `${zoneRoot}/arrival-boulevard/ground-1.webp`,
    "/traveler/temporary/v2/walk-1.webp",
    "/traveler/temporary/v2/walk-2.webp",
  ],
});
