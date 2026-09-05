import type { CountryPack, DialogueLine, TravelerState } from "@/lib/content/schema";

export const STEP_DURATION_SECONDS = 0.6;
export const GAIT_CYCLE_SECONDS = STEP_DURATION_SECONDS * 2;
export const METRES_PER_STEP = 0.75;
export const METRES_PER_SECOND = METRES_PER_STEP / STEP_DURATION_SECONDS;

export const ACTION_DURATIONS = {
  photo: 4,
  drink: 5.5,
  phone: 4.5,
  wave: 2.5,
  react: 2.5,
} as const;

type RouteActionKind = keyof typeof ACTION_DURATIONS | "encounter";

export type TravelerMotionAction = {
  kind: RouteActionKind;
  state: TravelerState;
  label: string;
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  encounterPhase?:
    | "notice"
    | "slow_walk"
    | "approach"
    | "greet"
    | "talk"
    | "listen"
    | "react"
    | "goodbye"
    | "resume_walk";
  dialogueLineIndex?: number;
};

export type TravelerMotionSnapshot = {
  rawActiveSeconds: number;
  locomotionSeconds: number;
  distanceMetres: number;
  plantIndex: number;
  plantedFoot: "left" | "right";
  cyclePhase: number;
  stepPhase: number;
  gaitFrameIndex: number;
  speedFactor: number;
  action: TravelerMotionAction | null;
};

type ScheduledAction = {
  atLocomotionSeconds: number;
  kind: RouteActionKind;
  durationSeconds: number;
  label: string;
  lines?: DialogueLine[];
};

const WALK_FRAME_PHASES = [0, 1 / 6, 2 / 6, 0.5, 4 / 6, 5 / 6];

function routeDuration(pack: CountryPack) {
  return pack.route.zones.reduce((total, zone) => total + zone.durationActiveSeconds, 0);
}

function alignedStep(seconds: number) {
  return Math.round(seconds / STEP_DURATION_SECONDS) * STEP_DURATION_SECONDS;
}

function dialogueDuration(lines: DialogueLine[]) {
  return lines.reduce((total, line) => total + (line.durationMs ?? 4_500) / 1_000, 0);
}

function actionsForPack(pack: CountryPack): ScheduledAction[] {
  if (pack.schemaVersion !== 3) return [];
  const duration = routeDuration(pack);
  const encounter = pack.encounters[0];
  const byKind: Partial<Record<string, ScheduledAction>> = {
    arrival: {
      atLocomotionSeconds: 0,
      kind: "wave",
      durationSeconds: ACTION_DURATIONS.wave,
      label: "Waving hello",
    },
    encounter: encounter
      ? {
          atLocomotionSeconds: 0,
          kind: "encounter",
          durationSeconds: 11.1 + dialogueDuration(encounter.lines),
          label: `Talking · ${encounter.locationLabel}`,
          lines: encounter.lines,
        }
      : undefined,
    food: {
      atLocomotionSeconds: 0,
      kind: "drink",
      durationSeconds: ACTION_DURATIONS.drink,
      label: "Taking a short drink",
    },
    landmark: {
      atLocomotionSeconds: 0,
      kind: "photo",
      durationSeconds: ACTION_DURATIONS.photo,
      label: "Taking a photograph",
    },
    departure: {
      atLocomotionSeconds: 0,
      kind: "phone",
      durationSeconds: ACTION_DURATIONS.phone,
      label: "Checking tomorrow’s route",
    },
  };

  return pack.storyBeats.flatMap((beat) => {
    const action = byKind[beat.kind];
    if (!action) return [];
    return [{ ...action, atLocomotionSeconds: alignedStep(beat.atFraction * duration) }];
  }).sort((left, right) => left.atLocomotionSeconds - right.atLocomotionSeconds);
}

function actionState(action: ScheduledAction, elapsedSeconds: number): TravelerMotionAction {
  const progress = Math.min(1, Math.max(0, elapsedSeconds / action.durationSeconds));
  if (action.kind !== "encounter") {
    const transitionIn = 0.45;
    const transitionOut = 0.65;
    const state = elapsedSeconds < transitionIn
      ? "stop"
      : elapsedSeconds >= action.durationSeconds - transitionOut
        ? "resume_walk"
        : action.kind;
    return { ...action, state, elapsedSeconds, progress };
  }

  const lines = action.lines ?? [];
  let cursor = 0;
  const fixed: Array<[number, TravelerMotionAction["encounterPhase"]]> = [
    [0.6, "notice"],
    [0.6, "slow_walk"],
    [1.2, "approach"],
    [2.5, "greet"],
  ];
  for (const [duration, phase] of fixed) {
    cursor += duration;
    if (elapsedSeconds < cursor) {
      return { ...action, state: phase!, encounterPhase: phase, elapsedSeconds, progress };
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    cursor += (lines[index]?.durationMs ?? 4_500) / 1_000;
    if (elapsedSeconds < cursor) {
      const phase = lines[index]?.speaker === "traveler" ? "talk" : "listen";
      return {
        ...action,
        state: phase,
        encounterPhase: phase,
        dialogueLineIndex: index,
        elapsedSeconds,
        progress,
      };
    }
  }
  cursor += 2.5;
  if (elapsedSeconds < cursor) {
    return { ...action, state: "react", encounterPhase: "react", elapsedSeconds, progress };
  }
  cursor += 2.5;
  if (elapsedSeconds < cursor) {
    return { ...action, state: "goodbye", encounterPhase: "goodbye", elapsedSeconds, progress };
  }
  return { ...action, state: "resume_walk", encounterPhase: "resume_walk", elapsedSeconds, progress };
}

function gaitFrameAt(cyclePhase: number) {
  for (let index = WALK_FRAME_PHASES.length - 1; index >= 0; index -= 1) {
    if (cyclePhase >= WALK_FRAME_PHASES[index]!) return index;
  }
  return 0;
}

/**
 * Converts server-owned watcher time into the canonical locomotion timeline.
 * Route actions consume watcher time while deliberately holding locomotion at
 * a planted-foot boundary, so reloads and concurrent viewers see the same
 * frame, public step count, and world distance.
 */
export function travelerMotionAt(
  pack: CountryPack,
  rawActiveSeconds: number,
): TravelerMotionSnapshot {
  const raw = Math.max(0, Number.isFinite(rawActiveSeconds) ? rawActiveSeconds : 0);
  const duration = routeDuration(pack);
  const actions = actionsForPack(pack);
  const pausedPerLoop = actions.reduce((total, action) => total + action.durationSeconds, 0);
  const extendedLoopDuration = duration + pausedPerLoop;
  const completedLoops = extendedLoopDuration > 0 ? Math.floor(raw / extendedLoopDuration) : 0;
  const localRaw = extendedLoopDuration > 0 ? raw - completedLoops * extendedLoopDuration : 0;
  let rawCursor = 0;
  let locomotionCursor = 0;
  let activeAction: TravelerMotionAction | null = null;

  for (const action of actions) {
    const walkingSeconds = Math.max(0, action.atLocomotionSeconds - locomotionCursor);
    if (localRaw < rawCursor + walkingSeconds) {
      locomotionCursor += localRaw - rawCursor;
      rawCursor = localRaw;
      break;
    }
    rawCursor += walkingSeconds;
    locomotionCursor = action.atLocomotionSeconds;
    if (localRaw < rawCursor + action.durationSeconds) {
      activeAction = actionState(action, localRaw - rawCursor);
      rawCursor = localRaw;
      break;
    }
    rawCursor += action.durationSeconds;
  }

  if (!activeAction && localRaw > rawCursor) {
    locomotionCursor += localRaw - rawCursor;
  }

  const locomotionSeconds = completedLoops * duration + Math.min(duration, locomotionCursor);
  const plantIndex = Math.floor((locomotionSeconds + 1e-7) / STEP_DURATION_SECONDS);
  const cyclePhase = (locomotionSeconds % GAIT_CYCLE_SECONDS) / GAIT_CYCLE_SECONDS;
  const stepPhase = (locomotionSeconds % STEP_DURATION_SECONDS) / STEP_DURATION_SECONDS;
  return {
    rawActiveSeconds: raw,
    locomotionSeconds,
    distanceMetres: plantIndex * METRES_PER_STEP + stepPhase * METRES_PER_STEP,
    plantIndex,
    plantedFoot: plantIndex % 2 === 0 ? "left" : "right",
    cyclePhase,
    stepPhase,
    gaitFrameIndex: gaitFrameAt(cyclePhase),
    speedFactor: activeAction ? 0 : 1,
    action: activeAction,
  };
}

export function visibleStepsBetween(
  pack: CountryPack,
  startRawActiveSeconds: number,
  endRawActiveSeconds: number,
) {
  return Math.max(
    0,
    travelerMotionAt(pack, endRawActiveSeconds).plantIndex
      - travelerMotionAt(pack, startRawActiveSeconds).plantIndex,
  );
}
