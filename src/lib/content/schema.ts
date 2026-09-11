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
}).strict();

export const encounterContentSchema = z.object({
  id: z.string().min(1),
  npcId: z.string().min(1),
  locationLabel: z.string().min(1),
  lines: z.array(dialogueLineSchema).min(2),
  nextStoryBeatId: z.string().optional(),
}).strict();

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
  "wait",
  "sleep",
  "look_up",
  "tie_shoe",
  "cheer",
  "stumble",
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

/**
 * What is left of the traveler after P18: the GLB is the character, and the only
 * image a pack still needs is the one frame that holds his place while it loads.
 * The Rive artboard, the sprite manifest and the walk cycle went with the 2D
 * renderers that read them.
 */
const travelerSchema = z.object({
  fallbackSprites: z.partialRecord(travelerStateSchema, z.string().startsWith("/")),
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
  /** Where the city is, used for the vote's distance fallback and the map. */
  lat: z.number().min(-90).max(90).default(0),
  lon: z.number().min(-180).max(180).default(0),
  /** Pack ids this country shares a land border with, for vote candidates. */
  neighbours: z.array(z.string().min(1)).default([]),
  /** One line on the ballot. Never visitor-authored. */
  voteBlurb: z.string().max(140).default(""),
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
    }).strict(),
  ).min(1),
}).strict();

export const routePropSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["tree", "lamp", "awning", "planter", "stall", "bench", "signpost"]),
  depth: z.number().min(0.4).max(1.2),
  minGap: z.number().int().min(120).max(2_000),
  maxGap: z.number().int().min(120).max(3_000),
  colors: z.array(z.string()).min(1).max(4),
  assetUrl: z.string().startsWith("/").optional(),
}).strict().refine((prop) => prop.maxGap >= prop.minGap, {
  message: "maxGap must be greater than or equal to minGap",
});

export const stageSchema = z.object({
  groundLineY: z.number().min(0).max(1).default(0.82),
  horizonY: z.number().min(0).max(1).default(0.55),
  personHeightFrac: z.number().positive().max(1).default(0.28),
  walkableX: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
    .refine(([left, right]) => left < right, "walkableX must be ordered")
    .default([0.15, 0.85]),
  palette: z.tuple([
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ]).default(["#b9a27a", "#6f7a5a", "#2e3a4f"]),
  lightDir: z.enum(["left", "right", "top"]).default("left"),
  parallax: z.object({
    far: z.number().nonnegative().max(3).default(0.35),
    mid: z.number().nonnegative().max(3).default(0.7),
    near: z.number().nonnegative().max(3).default(1.25),
  }).strict().prefault({}),
}).strict();

export type ZoneStage = z.infer<typeof stageSchema>;

/**
 * Optional launch-quality composition. Sky/city/foreground are full-canvas
 * layers; ground is the only horizontally seamless texture. Existing packs
 * omit this and keep the bounded single-painting fallback.
 */
export const continuousSceneSchema = z.object({
  skyUrl: z.string().startsWith("/"),
  cityUrl: z.string().startsWith("/"),
  groundUrl: z.string().startsWith("/"),
  foregroundUrl: z.string().startsWith("/").optional(),
  groundHeightFrac: z.number().min(0.08).max(0.45).default(0.22),
}).strict();

export const DEFAULT_ZONE_LENGTH_METRES = [1_200, 1_600, 1_600, 1_400, 2_200] as const;

/**
 * Zone ids are city-specific slugs (`plov-cafe`, `riverside-cafe`, `chaikhana`), so
 * only the ordinal position is canonical. `kind` names it once instead of leaving
 * every consumer to match substrings.
 */
export const ZONE_KINDS = ["arrival", "lanes", "market", "cafe", "landmark"] as const;
export const DEFAULT_ZONE_KINDS = ZONE_KINDS;
export const DEFAULT_DAY_ROUTE_METRES = 8_000;
export const DEFAULT_MARATHON_METRES = 42_195;

export const routeZoneSchema = z.object({
  stage: stageSchema.prefault({}),
  id: z.string().min(1),
  label: z.string().min(1),
  /** What this zone is, independent of its city-specific id. Defaults by position. */
  kind: z.enum(ZONE_KINDS).default("arrival"),
  lengthMetres: z.number().positive().max(100_000).default(DEFAULT_ZONE_LENGTH_METRES[0]),
  /** @deprecated Kept so older packs validate; route progress no longer reads it. */
  durationActiveSeconds: z.number().int().min(45).max(21_600),
  layers: z.array(routeLayerSchema).min(2),
  props: z.array(routePropSchema).min(3),
  lighting: z.object({
    skyTop: z.string(),
    skyBottom: z.string(),
    grade: z.string(),
    intensity: z.number().min(0).max(1),
  }).strict(),
  weather: z.enum(["clear", "breeze", "haze", "golden", "evening"]),
  audioIds: z.array(z.string()).default([]),
  eventStage: z.object({
    cameraPan: z.number().min(-0.2).max(0.2),
    cameraZoom: z.number().min(1).max(1.25),
    travelerAnchor: z.number().min(0.45).max(0.7),
    npcAnchor: z.number().min(0.65).max(0.9),
    backgroundLife: z.number().min(0).max(1),
  }).strict(),
  fallbackUrl: z.string().startsWith("/"),
  continuousScene: continuousSceneSchema.optional(),
  /**
   * The night master for this zone, when one has been painted. Present zones
   * cross-fade to it across dusk; absent ones are graded to night instead.
   */
  nightUrl: z.string().startsWith("/").optional(),
  /**
   * The lit-windows overlay for this zone, drawn additively across dusk. Optional
   * because the owner paints these; a zone without one simply grades to night.
   */
  lightsUrl: z.string().startsWith("/").optional(),
}).strict();

function routeSchemaWithDistanceDefaults() {
  return z.preprocess((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
    const route = candidate as Record<string, unknown>;
    if (!Array.isArray(route.zones)) return candidate;
    return {
      ...route,
      zones: route.zones.map((zone, index) => {
        if (!zone || typeof zone !== "object" || Array.isArray(zone)) return zone;
        const value = zone as Record<string, unknown>;
        return {
          ...value,
          lengthMetres: value.lengthMetres
            ?? DEFAULT_ZONE_LENGTH_METRES[index]
            ?? DEFAULT_ZONE_LENGTH_METRES[DEFAULT_ZONE_LENGTH_METRES.length - 1],
          kind: value.kind
            ?? DEFAULT_ZONE_KINDS[index]
            ?? DEFAULT_ZONE_KINDS[DEFAULT_ZONE_KINDS.length - 1],
        };
      }),
    };
  }, z.object({
    worldUnitsPerSecond: z.number().positive().max(300),
    travelerViewportAnchor: z.number().min(0.55).max(0.65),
    zones: z.array(routeZoneSchema).min(4).max(6),
  }).strict());
}

export const countryPackSchema = baseCountryPackSchema.extend({
  schemaVersion: z.literal(2),
  dayRouteMetres: z.number().positive().max(100_000).default(DEFAULT_DAY_ROUTE_METRES),
  marathonMetres: z.number().positive().max(1_000_000).default(DEFAULT_MARATHON_METRES),
  route: routeSchemaWithDistanceDefaults(),
  postcardBackgroundUrl: z.string().startsWith("/"),
});

export const culturalReviewSchema = z.object({
  reviewerName: z.string().min(2).nullable(),
  reviewedAt: z.string().datetime().nullable(),
  status: z.enum([
    "pending",
    "approved",
    "creator_reviewed",
    "provisional_preview",
    "changes_requested",
  ]),
  qualification: z.string().min(2).nullable().default(null),
  disposition: z.string().min(2).nullable().default(null),
  publicLaunchRequirement: z.string().min(2).nullable().default(null),
  citations: z.array(z.object({
    title: z.string().min(2),
    url: z.string().url(),
  }).strict()).default([]),
  notes: z.string().max(1_000),
}).strict().refine(
  (review) => !["approved", "creator_reviewed", "provisional_preview"].includes(review.status)
    || Boolean(review.reviewerName && review.reviewedAt && review.qualification && review.disposition),
  { message: "Reviewed packs require reviewer, qualification, disposition and timestamp" },
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
}).strict();

const DEFAULT_STORY_BEAT_METRES = {
  arrival: 150,
  encounter: 1_900,
  food: 4_800,
  landmark: 7_900,
} as const;

export const storyBeatSchema = z.preprocess((candidate) => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  const beat = candidate as Record<string, unknown>;
  const kind = beat.kind as keyof typeof DEFAULT_STORY_BEAT_METRES | "departure" | undefined;
  const { atFraction: legacyAtFraction, ...supported } = beat;
  void legacyAtFraction;
  return {
    ...supported,
    atMetres: beat.atMetres
      ?? (kind === "departure" ? null : kind ? DEFAULT_STORY_BEAT_METRES[kind] : undefined),
  };
}, z.object({
  id: z.string().min(1),
  kind: z.enum(["arrival", "encounter", "food", "landmark", "departure"]),
  atMetres: z.number().nonnegative().max(1_000_000).nullable(),
  durationSeconds: z.number().int().min(15).max(1_800),
  title: z.string().min(1),
  summary: z.string().min(1).max(360),
  encounterId: z.string().optional(),
}).strict()).refine((beat) => beat.kind !== "encounter" || Boolean(beat.encounterId), {
  message: "Encounter story beats require an encounterId",
}).refine((beat) => beat.kind === "departure" ? beat.atMetres === null : beat.atMetres !== null, {
  message: "Only departure remains time-based; all other story beats require atMetres",
});

export const preloadGroupSchema = z.object({
  id: z.string().min(1),
  timing: z.enum(["critical", "next_zone", "next_country"]),
  zoneId: z.string().optional(),
  assets: z.array(z.string().startsWith("/")).min(1),
}).strict();

/**
 * What the city does on its own. Defaulted whole so every existing pack keeps
 * validating and simply gets the quietest version of the world.
 */
export const ambientSchema = z.object({
  season: z.enum(["spring", "summer", "autumn", "winter"]).default("summer"),
  /** Falling petals or leaves; absent means the air is still. */
  petalColor: z.string().optional(),
  catColor: z.string().optional(),
  /** A tram or bus silhouette crossing the arrival zone. Opt-in per city. */
  tram: z.boolean().default(false),
}).strict();

export const countryPackV3Schema = baseCountryPackSchema
  .omit({ countryDayId: true })
  .extend({
    schemaVersion: z.literal(3),
    ambient: ambientSchema.prefault({}),
    packId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/),
    revision: z.number().int().positive(),
    dayRouteMetres: z.number().positive().max(100_000).default(DEFAULT_DAY_ROUTE_METRES),
    marathonMetres: z.number().positive().max(1_000_000).default(DEFAULT_MARATHON_METRES),
    route: routeSchemaWithDistanceDefaults(),
    postcardBackgroundUrl: z.string().startsWith("/"),
    postcard: z.object({
      title: z.string().min(1).max(80),
      safeCopy: z.string().min(1).max(240),
      focalPoint: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }).strict(),
      textColor: z.string().min(1),
    }).strict(),
    preloadGroups: z.array(preloadGroupSchema).min(2),
    storyBeats: z.array(storyBeatSchema).min(4).max(6),
    localPhrases: z.array(localPhraseSchema).min(1),
    culturalReview: culturalReviewSchema,
    /** Owner opt-in for selling a Ticket before the final cultural review lands. */
    ticketBuildable: z.boolean().default(false),
    resident: z.object({
      name: z.string().min(1).max(80).default("Local resident"),
      role: z.string().min(1).max(120).default("Local host"),
      variantId: z.string().min(2).default("resident-a"),
    }).strict().prefault({}),
    notebookLines: z.array(z.string().min(1).max(240)).max(8).default([]),
    npcSystem: z.object({
      baseType: z.enum(["resident-a", "resident-b"]),
      variantId: z.string().min(2),
      states: z.object({
        neutral: z.string().startsWith("/").optional(),
        greet: z.string().startsWith("/").optional(),
        talk: z.string().startsWith("/").optional(),
        listen: z.string().startsWith("/").optional(),
        react: z.string().startsWith("/").optional(),
        goodbye: z.string().startsWith("/").optional(),
      }).strict().prefault({}),
    }).strict(),
    editorial: z.object({
      owner: z.string().min(2),
      researchedAt: z.string().datetime(),
      sourceNotes: z.array(z.string().min(1)).min(2),
    }).strict(),
    assetBudgetBytes: z.number().int().positive().max(5_767_168),
  }).strict()
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
export type PackAmbient = z.infer<typeof ambientSchema>;
export type CountryPack = CountryPackV2 | CountryPackV3;
export type CountryPackV1 = z.infer<typeof countryPackV1Schema>;
export type RouteLayer = z.infer<typeof routeLayerSchema>;
export type RouteProp = z.infer<typeof routePropSchema>;
export type RouteZone = z.infer<typeof routeZoneSchema>;
export type TravelerState = z.infer<typeof travelerStateSchema>;

/** Packs a destination vote may offer: reviewed by the creator or a qualified local. */
export const VOTE_READY_REVIEW_STATUSES = ["approved", "creator_reviewed"] as const;

export function isVoteReadyPack(pack: CountryPack): boolean {
  if (pack.schemaVersion !== 3) return false;
  return (VOTE_READY_REVIEW_STATUSES as readonly string[])
    .includes(pack.culturalReview.status);
}
