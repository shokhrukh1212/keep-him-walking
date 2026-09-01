import { z } from "zod";

export const dialogueMoodSchema = z.enum([
  "neutral",
  "curious",
  "surprised",
  "amused",
  "thoughtful",
]);

export const dialogueLineSchema = z.object({
  speaker: z.enum(["traveler", "npc"]),
  text: z.string().min(1).max(240),
  mood: dialogueMoodSchema,
  durationMs: z.number().int().min(1_500).max(12_000).optional(),
});

export const encounterContentSchema = z.object({
  id: z.string().min(1),
  npcId: z.string().min(1),
  locationLabel: z.string().min(1),
  lines: z.array(dialogueLineSchema).min(2),
  nextStoryBeatId: z.string().optional(),
});

export const travelerStateSchema = z.enum([
  "loading",
  "idle",
  "start_walk",
  "walk",
  "slow_walk",
  "stop",
  "rest",
  "notice",
  "approach",
  "talk",
  "listen",
  "react",
  "wave",
  "phone",
  "drink",
  "photo",
  "sit",
  "goodbye",
  "resume_walk",
]);

const sceneLayerSchema = z.object({
  id: z.string().min(1),
  url: z.string().startsWith("/"),
  depth: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  scale: z.number().positive().default(1),
});

const travelerSchema = z.object({
  riveUrl: z.string().startsWith("/").nullable(),
  artboard: z.string().min(1),
  stateMachine: z.string().min(1),
  fallbackSprites: z.partialRecord(travelerStateSchema, z.string().startsWith("/")),
  walkCycle: z.object({
    frames: z.array(z.string().startsWith("/")).length(8),
    framesPerSecond: z.number().min(6).max(18),
  }).optional(),
});

const audioSchema = z.object({
  id: z.string().min(1),
  url: z.string().startsWith("/"),
  loop: z.boolean(),
});

const ambientActionSchema = z.object({
  state: travelerStateSchema,
  label: z.string(),
});

const baseCountryPackSchema = z.object({
  assetVersion: z.string().min(1),
  countryDayId: z.string().uuid(),
  countryCode: z.string().length(2),
  countryName: z.string().min(1),
  cityName: z.string().min(1),
  timeZone: z.string().min(1),
  scene: z.object({
    fallbackUrl: z.string().startsWith("/"),
    layers: z.array(sceneLayerSchema).min(3),
    palette: z.object({
      day: z.array(z.string()).min(2),
      night: z.array(z.string()).min(2),
    }),
  }),
  traveler: travelerSchema,
  npcAssets: z.record(z.string(), z.string().startsWith("/")),
  audio: z.array(audioSchema),
  ambientActions: z.array(ambientActionSchema).min(4),
  encounters: z.array(encounterContentSchema).min(1),
  preload: z.array(z.string().startsWith("/")),
});

export const countryPackV1Schema = baseCountryPackSchema.extend({
  schemaVersion: z.literal(1),
});

export const routeLayerSchema = z.object({
  id: z.enum(["distant", "architecture", "ground", "foreground"]),
  depth: z.number().min(0).max(1),
  speed: z.number().positive().max(1.5),
  y: z.number().min(0).max(1),
  height: z.number().positive().max(1),
  segments: z.array(
    z.object({
      id: z.string().min(1),
      url: z.string().startsWith("/"),
      worldWidth: z.number().int().min(320).max(2_400),
    }),
  ).min(1),
});

export const routePropSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["tree", "lamp", "awning", "planter", "stall", "bench", "signpost"]),
  depth: z.number().min(0.4).max(1.2),
  minGap: z.number().int().min(120).max(2_000),
  maxGap: z.number().int().min(120).max(3_000),
  colors: z.array(z.string()).min(1).max(4),
  assetUrl: z.string().startsWith("/").optional(),
}).refine((prop) => prop.maxGap >= prop.minGap, {
  message: "maxGap must be greater than or equal to minGap",
});

export const routeZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  durationActiveSeconds: z.number().int().min(45).max(21_600),
  layers: z.array(routeLayerSchema).min(2),
  props: z.array(routePropSchema).min(3),
  lighting: z.object({
    skyTop: z.string(),
    skyBottom: z.string(),
    grade: z.string(),
    intensity: z.number().min(0).max(1),
  }),
  weather: z.enum(["clear", "breeze", "haze", "golden", "evening"]),
  audioIds: z.array(z.string()).min(1),
  eventStage: z.object({
    cameraPan: z.number().min(-0.2).max(0.2),
    cameraZoom: z.number().min(1).max(1.25),
    travelerAnchor: z.number().min(0.45).max(0.7),
    npcAnchor: z.number().min(0.65).max(0.9),
    backgroundLife: z.number().min(0).max(1),
  }),
  fallbackUrl: z.string().startsWith("/"),
});

export const countryPackSchema = baseCountryPackSchema.extend({
  schemaVersion: z.literal(2),
  route: z.object({
    worldUnitsPerSecond: z.number().positive().max(300),
    travelerViewportAnchor: z.number().min(0.55).max(0.65),
    zones: z.array(routeZoneSchema).min(4).max(6),
  }),
  postcardBackgroundUrl: z.string().startsWith("/"),
});

export type DialogueMood = z.infer<typeof dialogueMoodSchema>;
export type DialogueLine = z.infer<typeof dialogueLineSchema>;
export type EncounterContent = z.infer<typeof encounterContentSchema>;
export type CountryPack = z.infer<typeof countryPackSchema>;
export type CountryPackV1 = z.infer<typeof countryPackV1Schema>;
export type RouteLayer = z.infer<typeof routeLayerSchema>;
export type RouteProp = z.infer<typeof routePropSchema>;
export type RouteZone = z.infer<typeof routeZoneSchema>;
export type TravelerState = z.infer<typeof travelerStateSchema>;
