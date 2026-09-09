import type { DialogueMood, TravelerState } from "@/lib/content/schema";
import type { RouteRuntime } from "@/lib/world/types";
import type { ActionReview } from "./action-preview";

export type FacingDirection = "left" | "right";

export type TravelerCommand = {
  state: TravelerState;
  mood: DialogueMood;
  facing: FacingDirection;
  walkingSpeed: number;
  walking: boolean;
  routeRuntime: RouteRuntime;
  motionSampleUntilMs: number;
  presenceTtlMs?: number;
  waitedSeconds?: number;
  reducedMotion: boolean;
  sponsorPatchUrl?: string;
  actionReview?: ActionReview;
};

export const DEFAULT_TRAVELER_COMMAND: TravelerCommand = {
  state: "loading",
  mood: "neutral",
  facing: "right",
  walkingSpeed: 1,
  walking: false,
  routeRuntime: {
    globalActiveSeconds: 0,
    globalDistanceMetres: 0,
    paceRate: 1,
    authoritativeAt: new Date(0).toISOString(),
    walking: false,
  },
  motionSampleUntilMs: Number.POSITIVE_INFINITY,
  reducedMotion: false,
  waitedSeconds: 0,
};
