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
  /** Presentation-only phase age from the deterministic locomotion state machine. */
  motionPhaseSeconds?: number;
  routeRuntime: RouteRuntime;
  motionSampleUntilMs: number;
  presenceTtlMs?: number;
  waitedSeconds?: number;
  /** Explicit local presentation inputs; neither affects journey authority. */
  localHour?: number;
  raining?: boolean;
  wakeElapsedSeconds?: number;
  reducedMotion: boolean;
  sponsorPatchUrl?: string;
  /** Premium placement only: the label on the bottle he drinks from. */
  sponsorBottleUrl?: string;
  actionReview?: ActionReview;
  /** Local panel layout only; the renderer keeps the same actor and mixer. */
  panelOpen?: boolean;
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
