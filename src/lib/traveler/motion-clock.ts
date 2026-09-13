import type { CharacterClip, ResidentType } from "@/lib/characters/manifest";
import type { CountryPack, DialogueLine, TravelerState } from "@/lib/content/schema";
import type { ScheduledActionView } from "@/lib/contracts";
import {
  ACTION_CLIPS,
  ACTION_STATES,
  activityLabel,
  activityWindow,
  conversationResident,
  conversationScript,
  conversationSegments,
  conversationSpeakerName,
  isCrowdActivityKind,
  type ActivityKind,
  type ActivitySource,
  type ConversationPhase,
  type CrowdActivityKind,
} from "@/lib/world/activities";
import { activeWalkingSecondsAt } from "@/lib/world/route-clock";
import type { WalkingClock } from "@/lib/world/types";

export const STEP_DURATION_SECONDS = 0.6;
export const GAIT_CYCLE_SECONDS = STEP_DURATION_SECONDS * 2;
export const METRES_PER_STEP = 0.75;
export const METRES_PER_SECOND = METRES_PER_STEP / STEP_DURATION_SECONDS;

/** The three things the crowd can ask for. Server-side these are enums. */
export type CrowdActionKind = CrowdActivityKind;

/** Any server-owned stop row. Crowd reactions were the first; every stop is one now. */
export type ScheduledCrowdAction = ScheduledActionView;

export type TravelerConversation = {
  scriptId: string | null;
  speakerName: string;
  residentType: ResidentType;
  lines: DialogueLine[];
};

export type TravelerMotionAction = {
  kind: ActivityKind;
  state: TravelerState;
  label: string;
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  /** Crowd reactions come from the watchers; beats and system stops from the server schedule. */
  source: ActivitySource;
  atActiveSecond: number;
  occurrenceKey: string | null;
  /** The whole take a solo stop plays after stepping out of the walk. */
  clip?: CharacterClip;
  conversation?: TravelerConversation;
  conversationPhase?: ConversationPhase;
  /** Seconds into the current conversation phase, so each take plays at its own speed. */
  conversationPhaseSeconds?: number;
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

const WALK_FRAME_PHASES = [0, 1 / 6, 2 / 6, 0.5, 4 / 6, 5 / 6];

const CONVERSATION_STATES: Record<ConversationPhase, TravelerState> = {
  notice: "notice",
  stop: "stop",
  approach: "idle",
  greet_traveler: "greet",
  greet_resident: "listen",
  talk: "talk",
  listen: "listen",
  goodbye_traveler: "goodbye",
  goodbye_resident: "listen",
  depart: "idle",
};

export function actionTravel(elapsed: number, duration: number) {
  const entry = Math.min(1, Math.max(0, elapsed / 1.2));
  const exit = Math.min(1, Math.max(0, (elapsed - duration + 1.2) / 1.2));
  return { seconds: 0.6 * (2 * entry - entry * entry + exit * exit),
    speed: elapsed < 1.2 ? 1 - entry : elapsed > duration - 1.2 ? exit : 0 };
}

function alignedStep(seconds: number) {
  return Math.round(seconds / STEP_DURATION_SECONDS) * STEP_DURATION_SECONDS;
}

function gaitFrameAt(cyclePhase: number) {
  for (let index = WALK_FRAME_PHASES.length - 1; index >= 0; index -= 1) {
    if (cyclePhase >= WALK_FRAME_PHASES[index]!) return index;
  }
  return 0;
}

function actionForRow(
  pack: CountryPack,
  row: ScheduledActionView,
  elapsedSeconds: number,
  durationSeconds: number,
): TravelerMotionAction {
  const source = row.source ?? "crowd";
  const base = {
    kind: row.kind,
    elapsedSeconds,
    durationSeconds,
    progress: Math.min(1, Math.max(0, elapsedSeconds / Math.max(1e-6, durationSeconds))),
    source,
    atActiveSecond: row.atActiveSecond,
    occurrenceKey: row.occurrenceKey ?? null,
  };
  if (row.kind === "conversation" || row.kind === "greeting") {
    const script = row.kind === "conversation" ? conversationScript(pack, row.variant) : null;
    const kind = script ? "conversation" : "greeting";
    const lines = script?.lines ?? [];
    const speakerName = conversationSpeakerName(pack, script);
    const segments = conversationSegments(lines);
    const segment = [...segments].reverse().find((candidate) => elapsedSeconds >= candidate.start) ?? segments[0]!;
    return {
      ...base,
      kind,
      state: CONVERSATION_STATES[segment.phase],
      // A script the pinned pack no longer carries plays as the wordless greeting it can honour.
      label: activityLabel(kind, source, speakerName),
      conversation: {
        scriptId: script?.id ?? null,
        speakerName,
        residentType: conversationResident(pack, script),
        lines,
      },
      conversationPhase: segment.phase,
      conversationPhaseSeconds: Math.max(0, elapsedSeconds - segment.start),
      ...(segment.lineIndex === undefined ? {} : { dialogueLineIndex: segment.lineIndex }),
    };
  }
  return {
    ...base,
    state: ACTION_STATES[row.kind],
    label: activityLabel(row.kind, source),
    clip: ACTION_CLIPS[row.kind],
  };
}

/**
 * The stop he is performing right now, if any. Every stop is a server window
 * pinned to the 0.6 s planted-foot grid, so every viewer starts it on the same
 * footfall. The server never lets two live windows overlap; should legacy rows
 * overlap, the one that started first finishes.
 */
export function activityAt(
  pack: CountryPack,
  rawActiveSeconds: number,
  scheduledActions: readonly ScheduledActionView[] = [],
): TravelerMotionAction | null {
  const raw = Math.max(0, Number.isFinite(rawActiveSeconds) ? rawActiveSeconds : 0);
  let best: { row: ScheduledActionView; start: number; duration: number } | null = null;
  for (const row of scheduledActions) {
    const window = activityWindow(row);
    if (!window) continue;
    const start = alignedStep(window[0]);
    // Windows are stored to the millisecond; do not let float subtraction add noise.
    const duration = Math.round((window[1] - window[0]) * 1_000) / 1_000;
    if (raw < start || raw >= start + duration) continue;
    if (!best || start < best.start || (start === best.start && row.kind.localeCompare(best.row.kind) < 0)) {
      best = { row, start, duration };
    }
  }
  return best ? actionForRow(pack, best.row, raw - best.start, best.duration) : null;
}

/**
 * Converts server-owned watched time, distance and stop windows into the
 * canonical motion timeline. Walking time is watched time minus every stop, so
 * the gait holds exactly while he stops and resumes on the same foot.
 */
export function travelerMotionAt(
  pack: CountryPack,
  rawActiveSeconds: number,
  distanceMetres = rawActiveSeconds * METRES_PER_SECOND,
  scheduledActions: readonly ScheduledActionView[] = [],
  walkingClock: WalkingClock | null = null,
): TravelerMotionSnapshot {
  const raw = Math.max(0, Number.isFinite(rawActiveSeconds) ? rawActiveSeconds : 0);
  const distance = Math.max(0, Number.isFinite(distanceMetres) ? distanceMetres : 0);
  const routeSeconds = activeWalkingSecondsAt(raw, scheduledActions, walkingClock);
  const action = activityAt(pack, raw, scheduledActions);
  const locomotionSeconds = routeSeconds;
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
    speedFactor: action
      ? actionTravel(action.elapsedSeconds, action.durationSeconds).speed
      : 1,
    action,
  };
}

/**
 * The crowd action he is performing right now, if the current stop came from
 * the watchers rather than from the server's own schedule.
 */
export function crowdActionKindOf(
  action: TravelerMotionAction | null | undefined,
): CrowdActionKind | null {
  if (!action || action.source !== "crowd") return null;
  return isCrowdActivityKind(action.kind) ? action.kind : null;
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
