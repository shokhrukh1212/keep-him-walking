import type { EncounterPhase, WorldCommand } from "./types";

export function encounterPhaseAt(progress: number): EncounterPhase {
  if (progress < 0 || progress >= 1) return "none";
  if (progress < 0.08) return "notice";
  if (progress < 0.15) return "decelerate";
  if (progress < 0.28) return "approach";
  if (progress < 0.36) return "greeting";
  if (progress < 0.62) return "dialogue";
  if (progress < 0.82) return "goodbye";
  return "restore";
}

export function worldCommandForEncounter(
  phase: EncounterPhase,
  walking: boolean,
): WorldCommand {
  const focused = ["approach", "greeting", "dialogue", "goodbye"].includes(phase);
  const speedFactor = phase === "none" || phase === "restore"
    ? walking ? 1 : 0
    : phase === "notice"
      ? 0.7
      : phase === "decelerate"
        ? 0.28
        : 0;
  return {
    walking,
    speedFactor,
    encounterPhase: phase,
    cameraZoom: focused ? 1.08 : 1,
    cameraPan: focused ? -0.035 : 0,
    backgroundLife: focused ? 0.22 : 1,
  };
}
