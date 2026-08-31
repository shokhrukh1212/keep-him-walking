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
  "walk",
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

export const countryPackSchema = z.object({
  schemaVersion: z.literal(1),
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
  traveler: z.object({
    riveUrl: z.string().startsWith("/").nullable(),
    artboard: z.string().min(1),
    stateMachine: z.string().min(1),
    fallbackSprites: z.partialRecord(travelerStateSchema, z.string().startsWith("/")),
  }),
  npcAssets: z.record(z.string(), z.string().startsWith("/")),
  audio: z.array(
    z.object({
      id: z.string(),
      url: z.string().startsWith("/"),
      loop: z.boolean(),
    }),
  ),
  ambientActions: z.array(
    z.object({
      state: travelerStateSchema,
      label: z.string(),
    }),
  ).min(4),
  encounters: z.array(encounterContentSchema).min(1),
  preload: z.array(z.string().startsWith("/")),
});

export type DialogueMood = z.infer<typeof dialogueMoodSchema>;
export type DialogueLine = z.infer<typeof dialogueLineSchema>;
export type EncounterContent = z.infer<typeof encounterContentSchema>;
export type CountryPack = z.infer<typeof countryPackSchema>;
export type TravelerState = z.infer<typeof travelerStateSchema>;
