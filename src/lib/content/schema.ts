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
  "greet",
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

const spriteFootSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  planted: z.boolean(),
});

const spriteFrameMetadataSchema = z.object({
  leftFoot: spriteFootSchema,
  rightFoot: spriteFootSchema,
  rootX: z.number().min(-0.25).max(0.25),
  rootY: z.number().min(-0.25).max(0.25),
  shadowScale: z.number().min(0.5).max(1.25),
  sponsorAnchor: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    scale: z.number().min(0.02).max(0.4),
    rotation: z.number().min(-45).max(45),
  }),
});

const spriteClipSchema = z.object({
  frames: z.array(z.string().startsWith("/")).min(1).max(16),
  framesPerSecond: z.number().min(1).max(18),
  loop: z.boolean(),
  strideWorldUnits: z.number().positive().max(300).optional(),
  metadata: z.array(spriteFrameMetadataSchema).min(1).max(16),
}).refine((clip) => clip.frames.length === clip.metadata.length, {
  message: "Sprite clips require one metadata record per frame",
});

export const spriteManifestSchema = z.object({
  version: z.literal(1),
  canvas: z.object({
    width: z.number().int().positive().max(1_024),
    height: z.number().int().positive().max(1_024),
    groundY: z.number().min(0.75).max(1),
  }),
  maxDecodedCacheBytes: z.number().int().positive().max(64 * 1_048_576),
  clips: z.partialRecord(travelerStateSchema, spriteClipSchema),
});

const travelerSchema = z.object({
  driver: z.enum(["sprite", "rive"]).optional(),
  riveUrl: z.string().startsWith("/").nullable(),
  artboard: z.string().min(1),
  stateMachine: z.string().min(1),
  viewModel: z.string().min(1).optional(),
  requiredInputs: z.array(z.enum([
    "walking",
    "walkingSpeed",
    "action",
    "mood",
    "facingRight",
    "reducedMotion",
    "sponsorPatch",
  ])).optional(),
  fallbackSprites: z.partialRecord(travelerStateSchema, z.string().startsWith("/")),
  walkCycle: z.object({
    frames: z.array(z.string().startsWith("/")).length(8),
    framesPerSecond: z.number().min(6).max(18),
  }).optional(),
  spriteManifest: spriteManifestSchema.optional(),
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

export const culturalReviewSchema = z.object({
  reviewerName: z.string().min(2).nullable(),
  reviewedAt: z.string().datetime().nullable(),
  status: z.enum(["pending", "approved", "provisional_preview", "changes_requested"]),
  qualification: z.string().min(2).nullable().default(null),
  disposition: z.string().min(2).nullable().default(null),
  publicLaunchRequirement: z.string().min(2).nullable().default(null),
  citations: z.array(z.object({
    title: z.string().min(2),
    url: z.string().url(),
  })).default([]),
  notes: z.string().max(1_000),
}).refine(
  (review) => !["approved", "provisional_preview"].includes(review.status)
    || Boolean(review.reviewerName && review.reviewedAt && review.qualification && review.disposition),
  { message: "Approved and provisional reviews require reviewer, qualification, disposition and timestamp" },
).refine(
  (review) => review.status !== "provisional_preview"
    || Boolean(review.publicLaunchRequirement && review.citations.length >= 1),
  { message: "Provisional reviews require citations and a public-launch requirement" },
);

export const localPhraseSchema = z.object({
  original: z.string().min(1),
  transliteration: z.string().min(1),
  gloss: z.string().min(1),
  pronunciation: z.string().min(1),
});

export const storyBeatSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["arrival", "encounter", "food", "landmark", "departure"]),
  atFraction: z.number().min(0).max(1),
  durationSeconds: z.number().int().min(15).max(1_800),
  title: z.string().min(1),
  summary: z.string().min(1).max(360),
  encounterId: z.string().optional(),
}).refine((beat) => beat.kind !== "encounter" || Boolean(beat.encounterId), {
  message: "Encounter story beats require an encounterId",
});

export const preloadGroupSchema = z.object({
  id: z.string().min(1),
  timing: z.enum(["critical", "next_zone", "next_country"]),
  zoneId: z.string().optional(),
  assets: z.array(z.string().startsWith("/")).min(1),
});

export const countryPackV3Schema = baseCountryPackSchema
  .omit({ countryDayId: true })
  .extend({
    schemaVersion: z.literal(3),
    packId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/),
    revision: z.number().int().positive(),
    route: z.object({
      worldUnitsPerSecond: z.number().positive().max(300),
      travelerViewportAnchor: z.number().min(0.55).max(0.65),
      zones: z.array(routeZoneSchema).min(4).max(6),
    }),
    postcardBackgroundUrl: z.string().startsWith("/"),
    postcard: z.object({
      title: z.string().min(1).max(80),
      safeCopy: z.string().min(1).max(240),
      focalPoint: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
      textColor: z.string().min(1),
    }),
    preloadGroups: z.array(preloadGroupSchema).min(2),
    storyBeats: z.array(storyBeatSchema).min(4).max(6),
    localPhrases: z.array(localPhraseSchema).min(1),
    culturalReview: culturalReviewSchema,
    npcSystem: z.object({
      baseType: z.enum(["resident-a", "resident-b"]),
      variantId: z.string().min(2),
      states: z.object({
        neutral: z.string().startsWith("/"),
        greet: z.string().startsWith("/"),
        talk: z.string().startsWith("/"),
        listen: z.string().startsWith("/"),
        react: z.string().startsWith("/"),
        goodbye: z.string().startsWith("/"),
      }),
    }),
    editorial: z.object({
      owner: z.string().min(2),
      researchedAt: z.string().datetime(),
      sourceNotes: z.array(z.string().min(1)).min(2),
    }),
    assetBudgetBytes: z.number().int().positive().max(5_767_168),
  })
  .superRefine((pack, context) => {
    if (pack.assetVersion !== pack.packId) {
      context.addIssue({
        code: "custom",
        path: ["assetVersion"],
        message: "assetVersion must equal immutable packId",
      });
    }
    const zoneIds = new Set(pack.route.zones.map((zone) => zone.id));
    for (const group of pack.preloadGroups) {
      if (group.zoneId && !zoneIds.has(group.zoneId)) {
        context.addIssue({
          code: "custom",
          path: ["preloadGroups"],
          message: `Unknown preload zone ${group.zoneId}`,
        });
      }
    }
    const encounterIds = new Set(pack.encounters.map((encounter) => encounter.id));
    for (const beat of pack.storyBeats) {
      if (beat.encounterId && !encounterIds.has(beat.encounterId)) {
        context.addIssue({
          code: "custom",
          path: ["storyBeats"],
          message: `Unknown encounter ${beat.encounterId}`,
        });
      }
    }
  });

export const readableCountryPackSchema = z.union([
  countryPackV1Schema,
  countryPackSchema,
  countryPackV3Schema,
]);

export type DialogueMood = z.infer<typeof dialogueMoodSchema>;
export type DialogueLine = z.infer<typeof dialogueLineSchema>;
export type EncounterContent = z.infer<typeof encounterContentSchema>;
export type CountryPackV2 = z.infer<typeof countryPackSchema>;
export type CountryPackV3 = z.infer<typeof countryPackV3Schema>;
export type CountryPack = CountryPackV2 | CountryPackV3;
export type CountryPackV1 = z.infer<typeof countryPackV1Schema>;
export type RouteLayer = z.infer<typeof routeLayerSchema>;
export type RouteProp = z.infer<typeof routePropSchema>;
export type RouteZone = z.infer<typeof routeZoneSchema>;
export type TravelerState = z.infer<typeof travelerStateSchema>;
export type SpriteManifest = z.infer<typeof spriteManifestSchema>;
