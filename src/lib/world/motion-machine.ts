import type { MotionPhase } from "./types";

export type MotionTransition = {
  desiredWalking: boolean;
  changedAtMs: number;
};

export function motionPhaseAt(
  transition: MotionTransition,
  nowMs: number,
  hasWalked: boolean,
): MotionPhase {
  const elapsed = Math.max(0, nowMs - transition.changedAtMs);
  if (transition.desiredWalking) {
    if (elapsed < 650) return hasWalked ? "resume_walk" : "start_walk";
    return "walk";
  }
  if (!hasWalked) return "idle";
  if (elapsed < 650) return "slow_walk";
  if (elapsed < 1_100) return "stop";
  return "rest";
}

export function motionSpeedForPhase(phase: MotionPhase): number {
  switch (phase) {
    case "start_walk":
    case "resume_walk":
      return 0.62;
    case "walk":
      return 1;
    case "slow_walk":
      return 0.38;
    default:
      return 0;
  }
}
