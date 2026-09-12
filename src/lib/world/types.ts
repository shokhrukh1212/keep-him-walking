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
