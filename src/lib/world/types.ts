import type { TravelerState } from "@/lib/content/schema";

export type RouteRuntime = {
  globalActiveSeconds: number;
  authoritativeAt: string;
  walking: boolean;
};

export type RoutePosition = {
  globalActiveSeconds: number;
  distance: number;
  zoneIndex: number;
  zoneId: string;
  zoneLabel: string;
  zoneElapsedSeconds: number;
  zoneProgress: number;
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
};

export type QualityTier = "low" | "medium" | "high";

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
