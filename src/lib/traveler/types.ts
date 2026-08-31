import type { DialogueMood, TravelerState } from "@/lib/content/schema";

export type FacingDirection = "left" | "right";

export type TravelerCommand = {
  state: TravelerState;
  mood: DialogueMood;
  facing: FacingDirection;
  walkingSpeed: number;
  reducedMotion: boolean;
  sponsorPatchUrl?: string;
};

export const DEFAULT_TRAVELER_COMMAND: TravelerCommand = {
  state: "loading",
  mood: "neutral",
  facing: "right",
  walkingSpeed: 1,
  reducedMotion: false,
};
