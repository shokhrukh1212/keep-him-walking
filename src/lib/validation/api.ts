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
});

export const sponsorMetricBodySchema = z.object({
  publicId: z.string().uuid(),
  eventType: z.enum(["impression", "engaged_view", "postcard_created", "postcard_shared", "session"]),
});
