import type { TravelerState } from "@/lib/content/schema";

export type RouteRuntime = {
  globalActiveSeconds: number;
  globalDistanceMetres: number;
  paceRate: number;
  authoritativeAt: string;
  walking: boolean;
};

export type RoutePosition = {
  phase: "route" | "evening";
  zoneIndex: number;
  zoneProgress: number;
  metresIntoZone: number;
  remainingToLandmark: number;
  marathonProgress: number;
};

export type ScenePosition = {
  zoneIndex: number;
  visitIndex: number;
  cycleIndex: number;
  secondsIntoVisit: number;
  visitProgress: number;
  /** How many places the pinned manifest loops through. */
  placeCount: number;
  /** Active-walking seconds each place is shown for. */
  visitSeconds: number;
  nextZoneIndex: number;
  /** Active-walking seconds until the next place; it pauses while he stops or waits. */
  secondsToNextVisit: number;
};

/**
 * The server's walking-clock anchor: at `anchorActiveSeconds` of watched time,
 * `heldActiveSeconds` had been spent inside stop windows. Every later second is
 * derived from the rows around it, so old rows never need to be resent.
 */
export type WalkingClock = {
  anchorActiveSeconds: number;
  heldActiveSeconds: number;
};

export type MotionPhase = Extract<
  TravelerState,
  "idle" | "start_walk" | "walk" | "slow_walk" | "stop" | "rest" | "resume_walk"
>;

export type EncounterPhase =
  | "none"
  | "notice"
  | "decelerate"
  | "approach"
  | "greeting"
  | "dialogue"
  | "goodbye"
  | "restore";

export type WorldCommand = {
  walking: boolean;
  speedFactor: number;
  encounterPhase: EncounterPhase;
  cameraZoom: number;
  cameraPan: number;
  backgroundLife: number;
  motionSampleUntilMs?: number;
};

export type QualityTier = "low" | "medium" | "high";

/**
 * Whether the world is showing a real painting. `retrying` keeps the last good
 * painting on screen; `fallback` is the neutral street drawn only when no painting
 * has loaded yet. Neither ever claims to depict the current place.
 */
export type SceneAssetState = "loading" | "ready" | "retrying" | "fallback";

export type WorldDiagnosticsSnapshot = {
  routeSeconds: number;
  distance: number;
  zoneId: string;
  segmentIndex: number;
  segmentSignature: string;
  fps: number;
  p95FrameMs: number;
  liveObjects: number;
  pooledObjects: number;
  estimatedTextureBytes: number;
};
