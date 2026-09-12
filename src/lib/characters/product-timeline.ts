import type { CountryPack, TravelerState } from "@/lib/content/schema";
import type { ActionReview } from "@/lib/traveler/action-preview";
import { reviewPoseAt } from "@/lib/traveler/action-preview";
import { STEP_DURATION_SECONDS, type TravelerMotionAction, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { packBaseResident, STOP_ENTRY_CLIP, STOP_ENTRY_SECONDS } from "@/lib/world/activities";
import { CLIP_DURATIONS, type CharacterClip, type ResidentType } from "./manifest";
import type { CharacterCue } from "./timeline";
import { waitingBehaviorAt } from "@/lib/presence/waiting";

export type ProductCharacterScene = {
  traveler: CharacterCue;
  resident: CharacterCue;
  showResident: boolean;
  conversation: boolean;
  /** The resident model this conversation's script names. */
  residentType?: ResidentType;
  travelerLeanRadians?: number;
};

const BRISK_PACE_THRESHOLD = 3;
const BRISK_WALK_TIME_SCALE = 1.25;
const BRISK_FORWARD_LEAN_RADIANS = 2 * Math.PI / 180;
export const clipForState = (state: TravelerState): CharacterClip => {
  const clips: Partial<Record<TravelerState, CharacterClip>> = {
    loading: "idle",
    idle: "idle",
    start_walk: "walk_start",
    walk: "walk",
    slow_walk: "stop",
    stop: "walk_stop",
    notice: "notice",
    approach: "walk",
    greet: "greet",
    wave: "greet",
    talk: "talk",
    listen: "listen",
    react: "react",
    photo: "photo",
    drink: "drink",
    phone: "phone",
    rest: "rest",
    sit: "rest",
    wait: "wait_pockets",
    sleep: "sleep",
    look_up: "look_up",
    tie_shoe: "tie_shoe",
    cheer: "cheer",
    stumble: "stumble",
    stretch: "wait_stretch",
    yawn: "wait_yawn",
    goodbye: "goodbye",
    resume_walk: "resume",
  };
  return clips[state] ?? "idle";
};

const scaledCue = (clip: CharacterClip, elapsed: number, duration: number): CharacterCue => ({
  clip,
  seconds: Math.max(0, Math.min(CLIP_DURATIONS[clip] - 1e-5, elapsed / Math.max(1e-5, duration) * CLIP_DURATIONS[clip])),
});

/** A take at its recorded speed, holding its last frame rather than being squeezed. */
const naturalCue = (clip: CharacterClip, seconds: number): CharacterCue => ({
  clip,
  seconds: Math.max(0, Math.min(CLIP_DURATIONS[clip] - 1e-5, Number.isFinite(seconds) ? seconds : 0)),
});

/** A looping take (talking, listening, idling) at its recorded speed. */
const loopedCue = (clip: CharacterClip, seconds: number): CharacterCue => {
  const duration = CLIP_DURATIONS[clip];
  const value = Number.isFinite(seconds) ? seconds : 0;
  return { clip, seconds: ((value % duration) + duration) % duration };
};

const oppositeCue = (traveler: CharacterCue): CharacterCue => {
  const clip = traveler.clip === "talk"
    ? "listen"
    : traveler.clip === "listen"
      ? "talk"
      : traveler.clip === "greet" || traveler.clip === "goodbye"
        ? traveler.clip
        : "idle";
  return { clip, seconds: traveler.seconds % CLIP_DURATIONS[clip] };
};

/**
 * She answers his greeting slightly after he offers it, and his goodbye slightly
 * before hers (PRODUCT §5). Every take plays at its own length.
 */
function conversationCue(pack: CountryPack, action: TravelerMotionAction): ProductCharacterScene {
  const local = action.conversationPhaseSeconds ?? 0;
  let traveler: CharacterCue;
  let resident: CharacterCue;
  switch (action.conversationPhase) {
    case "notice":
      traveler = naturalCue("notice", local);
      resident = loopedCue("idle", local);
      break;
    case "stop":
      traveler = naturalCue(STOP_ENTRY_CLIP, local);
      resident = loopedCue("idle", local + CLIP_DURATIONS.notice);
      break;
    case "talk":
      traveler = loopedCue("talk", local);
      resident = loopedCue("listen", local);
      break;
    case "listen":
      traveler = loopedCue("listen", local);
      resident = loopedCue("talk", local);
      break;
    case "goodbye":
      traveler = naturalCue("goodbye", local);
      resident = naturalCue("goodbye", Math.max(0, local - 0.25));
      break;
    case "greet":
    default:
      traveler = naturalCue("greet", local);
      resident = naturalCue("greet", Math.max(0, local - 0.35));
      break;
  }
  return {
    traveler,
    resident,
    showResident: true,
    conversation: true,
    residentType: action.conversation?.residentType ?? packBaseResident(pack),
  };
}

/** He steps out of the walk, then plays the whole take; the mixer crossfades back into the walk. */
function actionCue(action: TravelerMotionAction): ProductCharacterScene {
  const elapsed = action.elapsedSeconds;
  const traveler = elapsed < STOP_ENTRY_SECONDS
    ? naturalCue(STOP_ENTRY_CLIP, elapsed)
    : naturalCue(action.clip ?? clipForState(action.state), elapsed - STOP_ENTRY_SECONDS);
  return { traveler, resident: { clip: "idle", seconds: 0 }, showResident: false, conversation: false };
}

function reviewCue(review: ActionReview, now: number): ProductCharacterScene | null {
  const pose = reviewPoseAt(review, now);
  if (!pose) return null;
  const clip = clipForState(pose.state);
  const traveler = pose.action
    ? scaledCue(clip, pose.action.progress, 1)
    : { clip, seconds: pose.seconds % CLIP_DURATIONS[clip] };
  const showResident = ["greet", "talk", "listen", "goodbye"].includes(pose.state);
  return { traveler, resident: oppositeCue(traveler), showResident, conversation: showResident };
}

/** Maps the server-owned journey sample to the single GLB skeleton used on the product. */
export function productCharacterSceneAt(
  pack: CountryPack,
  motion: TravelerMotionSnapshot,
  traveling: boolean,
  review: ActionReview | undefined,
  now: number,
  paceRate = 1,
  waitedSeconds = 0,
  localHour = 12,
  raining = false,
  wakeElapsedSeconds: number | undefined = undefined,
  locomotionState: TravelerState | undefined = undefined,
  motionPhaseSeconds = 0,
): ProductCharacterScene {
  const localReview = review ? reviewCue(review, now) : null;
  if (localReview) return localReview;
  if (!motion.action && locomotionState) {
    const transition = locomotionState === "start_walk"
      ? scaledCue("walk_start", motionPhaseSeconds, .65)
      : locomotionState === "resume_walk"
        ? scaledCue("resume", motionPhaseSeconds, .65)
        : locomotionState === "slow_walk"
          ? scaledCue("stop", motionPhaseSeconds, .65)
          : locomotionState === "stop"
            ? scaledCue("walk_stop", Math.max(0, motionPhaseSeconds - .65), .45)
            : null;
    if (transition) {
      return {
        traveler: transition,
        resident: { clip: "idle", seconds: 0 },
        showResident: false,
        conversation: false,
      };
    }
  }
  if (!traveling) {
    if (wakeElapsedSeconds !== undefined) {
      // The stand-up take starts seated, so only a traveler whose wait reached the seated
      // phase rises with it; one still on his feet looks up for the whole beat.
      const seated = waitingBehaviorAt(waitedSeconds).phase === "sit";
      const rising = seated && wakeElapsedSeconds >= .8;
      const clip: CharacterClip = rising ? "stand_up" : seated ? "sitting" : "look_up";
      const clipSeconds = rising ? wakeElapsedSeconds - .8 : wakeElapsedSeconds;
      return {
        traveler: { clip, seconds: Math.min(CLIP_DURATIONS[clip] - 1e-5, Math.max(0, clipSeconds)) },
        resident: { clip: "idle", seconds: 0 }, showResident: false, conversation: false,
      };
    }
    const waiting = waitingBehaviorAt(waitedSeconds, localHour >= 21 || localHour < 5);
    const clip = waiting.clip;
    return {
      traveler: {
        clip,
        seconds: Math.min(CLIP_DURATIONS[clip] - 1e-5, waiting.clipSeconds),
      },
      resident: { clip: "idle", seconds: 0 },
      showResident: false,
      conversation: false,
    };
  }
  if (motion.action?.kind === "conversation" || motion.action?.kind === "greeting") {
    return conversationCue(pack, motion.action);
  }
  if (motion.action) return actionCue(motion.action);
  const brisk = paceRate >= BRISK_PACE_THRESHOLD;
  const stepStart = Math.floor(motion.locomotionSeconds / STEP_DURATION_SECONDS)
    * STEP_DURATION_SECONDS;
  const stepElapsed = motion.locomotionSeconds - stepStart;
  const visualLocomotionSeconds = brisk
    ? stepStart + Math.min(
        STEP_DURATION_SECONDS - 1e-5,
        stepElapsed * BRISK_WALK_TIME_SCALE,
      )
    : motion.locomotionSeconds;
  return {
    traveler: {
      clip: raining ? "umbrella_walk" : brisk ? "walk_brisk" : "walk",
      seconds: visualLocomotionSeconds % CLIP_DURATIONS.walk,
      timeScale: brisk ? BRISK_WALK_TIME_SCALE : 1,
    },
    resident: { clip: "idle", seconds: 0 },
    showResident: false,
    conversation: false,
    travelerLeanRadians: brisk ? BRISK_FORWARD_LEAN_RADIANS : 0,
  };
}
