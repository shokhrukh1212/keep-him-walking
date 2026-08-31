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
