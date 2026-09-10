import { z } from "zod";

export const heartbeatBodySchema = z.object({
  sessionId: z.string().uuid(),
  state: z.enum(["active", "inactive"]),
  sceneReady: z.boolean(),
});

export const voteBodySchema = z.object({
  voteId: z.string().uuid(),
  optionId: z.string().uuid(),
});

export const postcardBodySchema = z.object({
  countryDayId: z.string().uuid(),
});

export const sponsorCheckoutBodySchema = z.object({
  slotId: z.string().uuid(),
  sponsorName: z.string().trim().min(2).max(100),
  sponsorEmail: z.email().max(254),
  /** Tier is a closed enum; the server prices it, the client never sends a price. */
  tier: z.enum(["standard", "premium"]).default("standard"),
});

export const ticketCheckoutBodySchema = z.object({
  slotId: z.uuid(),
  packId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/),
  sponsorName: z.string().trim().min(2).max(100),
  sponsorEmail: z.email().max(254),
}).strict();

export const sponsorMetricBodySchema = z.object({
  publicId: z.string().uuid(),
  eventType: z.enum(["impression", "engaged_view", "postcard_created", "postcard_shared", "session"]),
});

/** Reactions are a closed enum. No visitor free text is ever accepted here. */
export const reactionBodySchema = z.object({
  kind: z.enum(["wave", "water", "photo"]),
});

export const dayPhotoQuerySchema = z.object({
  countryDayId: z.uuid(),
  atActiveSecond: z.number().int().min(0).max(86_400 * 2),
  atDistanceMetres: z.number().min(0).max(1_000_000),
});

/** P20's private queue is the sole visitor free-text exception. */
export const correctionBodySchema = z.object({
  packId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/),
  zoneId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable().optional(),
  category: z.enum(["place", "phrase", "dialogue", "art", "other"]),
  body: z.string().trim().min(1).max(280),
}).strict();

export const correctionModerationSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
}).strict();
