import type { CountryPack, DialogueLine, TravelerState } from "@/lib/content/schema";
import { activeWalkingSecondsAt, deterministicVariant, routePositionAt, SCENE_VISIT_SECONDS } from "@/lib/world/route-clock";

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
  look_up: 3,
  tie_shoe: 4,
  stumble: 2.5,
  cheer: 3,
} as const;

type RouteActionKind = keyof typeof ACTION_DURATIONS | "encounter";

/** The three things the crowd can ask for. Server-side these are enums. */
export type CrowdActionKind = "wave" | "drink" | "photo";

/** One crowd action the server has already committed to, on the raw-second clock. */
export type ScheduledCrowdAction = {
  kind: CrowdActionKind;
  atActiveSecond: number;
  endsAtActiveSecond?: number;
  frozenDistanceMetres?: number | null;
};

const CROWD_ACTION_LABELS: Record<CrowdActionKind, string> = {
  wave: "Waving back",
  drink: "Taking a drink",
  photo: "Taking a photograph",
};

export type TravelerMotionAction = {
  kind: RouteActionKind;
  state: TravelerState;
  label: string;
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  /** Route beats come from the pack; crowd actions come from the watchers. */
  source: "route" | "crowd" | "system";
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
  routeSeconds: number;
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
  atWalkingSecond: number;
  kind: RouteActionKind;
  durationSeconds: number;
  label: string;
  lines?: DialogueLine[];
};

const WALK_FRAME_PHASES = [0, 1 / 6, 2 / 6, 0.5, 4 / 6, 5 / 6];

export function actionTravel(elapsed: number, duration: number) {
  const entry = Math.min(1, Math.max(0, elapsed / 1.2));
  const exit = Math.min(1, Math.max(0, (elapsed - duration + 1.2) / 1.2));
  return { seconds: 0.6 * (2 * entry - entry * entry + exit * exit),
    speed: elapsed < 1.2 ? 1 - entry : elapsed > duration - 1.2 ? exit : 0 };
}

function alignedStep(seconds: number) {
  return Math.round(seconds / STEP_DURATION_SECONDS) * STEP_DURATION_SECONDS;
}

function dialogueDuration(lines: DialogueLine[]) {
  return lines.reduce((total, line) => total + (line.durationMs ?? 4_500) / 1_000, 0);
}

function actionsForPack(pack: CountryPack): ScheduledAction[] {
  if (pack.schemaVersion !== 3) return [];
  const encounter = pack.encounters[0];
  const byKind: Partial<Record<string, ScheduledAction>> = {
    arrival: {
      atWalkingSecond: 15,
      kind: "wave",
      durationSeconds: ACTION_DURATIONS.wave,
      label: "Waving hello",
    },
    encounter: encounter
      ? {
          atWalkingSecond: SCENE_VISIT_SECONDS + 15,
          kind: "encounter",
          durationSeconds: 11.1 + dialogueDuration(encounter.lines),
          label: `Talking · ${encounter.locationLabel}`,
          lines: encounter.lines,
        }
      : undefined,
    food: {
      atWalkingSecond: SCENE_VISIT_SECONDS * 3 + 15,
      kind: "drink",
      durationSeconds: ACTION_DURATIONS.drink,
      label: "Taking a short drink",
    },
    landmark: {
      atWalkingSecond: SCENE_VISIT_SECONDS * 4 + 15,
      kind: "photo",
      durationSeconds: ACTION_DURATIONS.photo,
      label: "Taking a photograph",
    },
    departure: {
      atWalkingSecond: SCENE_VISIT_SECONDS * 5 - 15,
      kind: "phone",
      durationSeconds: ACTION_DURATIONS.phone,
      label: "Checking tomorrow’s route",
    },
  };

  return pack.storyBeats.flatMap((beat) => {
    const action = byKind[beat.kind];
    // Departure is deliberately absent: it remains the one rollover-time event.
    if (!action || beat.kind === "departure") return [];
    return [action];
  }).sort((left, right) => left.atWalkingSecond - right.atWalkingSecond);
}

function storyTimelineAt(
  pack: CountryPack,
  baseWalkingSeconds: number,
): { walkingSeconds: number; action: TravelerMotionAction | null; pausedSeconds: number; lastCompletedBaseSecond: number } {
  const base = Math.max(0, baseWalkingSeconds);
  let completedPause = 0;
  let lastCompletedBaseSecond = Number.NEGATIVE_INFINITY;
  for (const action of actionsForPack(pack)) {
    const startsAt = action.atWalkingSecond + completedPause;
    if (base < startsAt) break;
    const elapsed = base - startsAt;
    if (elapsed < action.durationSeconds) {
      return {
        walkingSeconds: action.atWalkingSecond,
        action: actionState(action, elapsed),
        pausedSeconds: completedPause + elapsed,
        lastCompletedBaseSecond,
      };
    }
    completedPause += action.durationSeconds;
    lastCompletedBaseSecond = startsAt + action.durationSeconds;
  }
  return {
    walkingSeconds: Math.max(0, base - completedPause),
    action: null,
    pausedSeconds: completedPause,
    lastCompletedBaseSecond,
  };
}

/**
 * Authoritative watched time minus server action windows and deterministic
 * first-visit story stops. It never reads pace or viewer count.
 */
export function dailyActiveWalkingSecondsAt(
  pack: CountryPack,
  rawActiveSeconds: number,
  scheduledActions: readonly ScheduledCrowdAction[] = [],
) {
  return storyTimelineAt(
    pack,
    activeWalkingSecondsAt(rawActiveSeconds, scheduledActions),
  ).walkingSeconds;
}

function actionState(
  action: ScheduledAction,
  elapsedSeconds: number,
  source: TravelerMotionAction["source"] = "route",
): TravelerMotionAction {
  const progress = Math.min(1, Math.max(0, elapsedSeconds / action.durationSeconds));
  if (action.kind !== "encounter") {
    const transitionIn = 0.45;
    const transitionOut = 0.65;
    const state = elapsedSeconds < transitionIn
      ? "stop"
      : elapsedSeconds >= action.durationSeconds - transitionOut
        ? "resume_walk"
        : action.kind;
    return { ...action, source, state, elapsedSeconds, progress };
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
      return { ...action, source, state: phase!, encounterPhase: phase, elapsedSeconds, progress };
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    cursor += (lines[index]?.durationMs ?? 4_500) / 1_000;
    if (elapsedSeconds < cursor) {
      const phase = lines[index]?.speaker === "traveler" ? "talk" : "listen";
      return {
        ...action,
        source,
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
    return { ...action, source, state: "react", encounterPhase: "react", elapsedSeconds, progress };
  }
  cursor += 2.5;
  if (elapsedSeconds < cursor) {
    return { ...action, source, state: "goodbye", encounterPhase: "goodbye", elapsedSeconds, progress };
  }
  return { ...action, source, state: "resume_walk", encounterPhase: "resume_walk", elapsedSeconds, progress };
}

function gaitFrameAt(cyclePhase: number) {
  for (let index = WALK_FRAME_PHASES.length - 1; index >= 0; index -= 1) {
    if (cyclePhase >= WALK_FRAME_PHASES[index]!) return index;
  }
  return 0;
}

/**
 * Resolves which crowd action, if any, the traveler is performing right now.
 *
 * Crowd actions are scheduled by the server on the raw watched-second clock and
 * are pinned to the same 0.6 s planted-foot grid the route beats use, so every
 * viewer performs them on the same footfall.
 *
 * A crowd action never interrupts a route beat: the beat always wins. To make
 * that a deferral rather than a silent drop, the elapsed time is the smaller of
 * the time since the action was scheduled and the time since the last route beat
 * finished. Both are derived from the authoritative inputs alone — the second
 * from distance, which is why it works without any history — so an action that
 * was scheduled mid-encounter starts cleanly the moment the goodbye ends.
 */
function crowdActionAt(
  rawActiveSeconds: number,
  distanceMetres: number,
  scheduled: readonly ScheduledCrowdAction[],
  routeBeatActive: boolean,
  lastCompletedBeatEndRawSecond: number,
): TravelerMotionAction | null {
  if (routeBeatActive || scheduled.length === 0) return null;
  const sinceLastBeat = Number.isFinite(lastCompletedBeatEndRawSecond)
    ? Math.max(0, rawActiveSeconds - lastCompletedBeatEndRawSecond)
    : Number.POSITIVE_INFINITY;

  const ordered = [...scheduled]
    .filter((entry) => Number.isFinite(entry.atActiveSecond) && entry.kind in CROWD_ACTION_LABELS)
    .sort((left, right) => left.atActiveSecond - right.atActiveSecond
      || left.kind.localeCompare(right.kind));

  let best: { entry: ScheduledCrowdAction; elapsed: number } | null = null;
  for (const entry of ordered) {
    const sinceScheduled = rawActiveSeconds - alignedStep(entry.atActiveSecond);
    if (sinceScheduled < 0) continue;
    const elapsed = Math.min(sinceScheduled, sinceLastBeat);
    const duration = Number.isFinite(entry.endsAtActiveSecond)
      ? Math.max(0, entry.endsAtActiveSecond! - entry.atActiveSecond)
      : ACTION_DURATIONS[entry.kind];
    if (elapsed >= duration) continue;
    if (best === null || elapsed < best.elapsed) best = { entry, elapsed };
  }
  if (best === null) return null;

  return actionState(
    {
      atWalkingSecond: 0,
      kind: best.entry.kind,
      durationSeconds: Number.isFinite(best.entry.endsAtActiveSecond)
        ? Math.max(0, best.entry.endsAtActiveSecond! - best.entry.atActiveSecond)
        : ACTION_DURATIONS[best.entry.kind],
      label: CROWD_ACTION_LABELS[best.entry.kind],
    },
    best.elapsed,
    "crowd",
  );
}

function systemAction(
  kind: Extract<RouteActionKind, "look_up" | "tie_shoe" | "stumble" | "cheer">,
  elapsedSeconds: number,
  label: string,
): TravelerMotionAction | null {
  const durationSeconds = ACTION_DURATIONS[kind];
  if (elapsedSeconds < 0 || elapsedSeconds >= durationSeconds) return null;
  return actionState({ atWalkingSecond: 0, kind, durationSeconds, label }, elapsedSeconds, "system");
}

/** Deterministic ambient actions from explicit authority; no timer or module state participates. */
export function systemActionAt(
  pack: CountryPack,
  rawActiveSeconds: number,
  distanceMetres: number,
): TravelerMotionAction | null {
  if (pack.schemaVersion !== 3) return null;
  const route = routePositionAt(pack, distanceMetres);
  const zone = pack.route.zones[route.zoneIndex];
  const seed = pack.assetVersion;

  const stumbleAt = pack.dayRouteMetres * .25
    + deterministicVariant(`${seed}:stumble`, 0, Math.max(1, Math.floor(pack.dayRouteMetres * .5)));
  const stumble = systemAction("stumble", (distanceMetres - stumbleAt) / METRES_PER_SECOND, "Stumbling, then finding his feet");
  if (stumble) return stumble;

  const cheer = systemAction("cheer", (distanceMetres - pack.marathonMetres) / METRES_PER_SECOND, "Celebrating a marathon");
  if (cheer) return cheer;

  const tiePeriod = 15 * 60;
  const tieOffset = deterministicVariant(`${seed}:tie-shoe`, 0, tiePeriod - ACTION_DURATIONS.tie_shoe);
  const tie = systemAction("tie_shoe", (rawActiveSeconds - tieOffset + tiePeriod) % tiePeriod, "Tying a shoe");
  if (rawActiveSeconds >= tieOffset && tie) return tie;

  if (zone?.kind === "lanes" || zone?.kind === "landmark") {
    const lookPeriod = 9 * 60;
    const lookOffset = deterministicVariant(`${seed}:look-up`, 0, lookPeriod - ACTION_DURATIONS.look_up);
    const look = systemAction("look_up", (rawActiveSeconds - lookOffset + lookPeriod) % lookPeriod, "Looking up at the city");
    if (rawActiveSeconds >= lookOffset && look) return look;
  }
  return null;
}

/**
 * Converts server-owned watcher time and distance into the canonical motion
 * timeline. Metre beats are rounded onto a planted-foot boundary; distance
 * remains the authoritative world track while the gait holds for an action.
 *
 * Crowd actions the server has already scheduled are merged in as a fourth
 * authoritative input. They never displace a route beat and never alter the
 * locomotion clock, so step counts and the gait stay exactly as they were.
 */
export function travelerMotionAt(
  pack: CountryPack,
  rawActiveSeconds: number,
  distanceMetres = rawActiveSeconds * METRES_PER_SECOND,
  scheduledActions: readonly ScheduledCrowdAction[] = [],
): TravelerMotionSnapshot {
  const raw = Math.max(0, Number.isFinite(rawActiveSeconds) ? rawActiveSeconds : 0);
  const distance = Math.max(0, Number.isFinite(distanceMetres) ? distanceMetres : 0);
  const baseWalkingSeconds = activeWalkingSecondsAt(raw, scheduledActions);
  const story = storyTimelineAt(pack, baseWalkingSeconds);
  const activeAction = story.action;
  const actionSeconds = activeAction
    ? actionTravel(activeAction.elapsedSeconds, activeAction.durationSeconds).seconds
    : actionsForPack(pack).filter((action) => story.walkingSeconds > action.atWalkingSecond)
      .length * 1.2;

  const crowdAction = crowdActionAt(
    raw,
    distance,
    scheduledActions,
    activeAction !== null,
    Number.isFinite(story.lastCompletedBaseSecond)
      ? Math.max(0, raw - (baseWalkingSeconds - story.lastCompletedBaseSecond))
      : Number.NEGATIVE_INFINITY,
  );
  const ambientAction = activeAction || crowdAction
    ? null
    : systemActionAt(pack, raw, distance);
  const resolvedAction = activeAction ?? crowdAction ?? ambientAction;

  const routeSeconds = story.walkingSeconds;
  const locomotionSeconds = Math.max(0, story.walkingSeconds + actionSeconds);
  const plantIndex = Math.floor((locomotionSeconds + 1e-7) / STEP_DURATION_SECONDS);
  const cyclePhase = (locomotionSeconds % GAIT_CYCLE_SECONDS) / GAIT_CYCLE_SECONDS;
  const stepPhase = (locomotionSeconds % STEP_DURATION_SECONDS) / STEP_DURATION_SECONDS;
  return {
    rawActiveSeconds: raw,
    locomotionSeconds,
    routeSeconds,
    distanceMetres: distance,
    plantIndex,
    plantedFoot: plantIndex % 2 === 0 ? "left" : "right",
    cyclePhase,
    stepPhase,
    gaitFrameIndex: gaitFrameAt(cyclePhase),
    speedFactor: resolvedAction
      ? actionTravel(resolvedAction.elapsedSeconds, resolvedAction.durationSeconds).speed
      : 1,
    action: resolvedAction,
  };
}

/**
 * The crowd action he is performing right now, if the current action came from
 * the watchers rather than from the pack's own story beats.
 */
export function crowdActionKindOf(
  action: TravelerMotionAction | null | undefined,
): CrowdActionKind | null {
  if (!action || action.source !== "crowd") return null;
  return action.kind in CROWD_ACTION_LABELS ? (action.kind as CrowdActionKind) : null;
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
