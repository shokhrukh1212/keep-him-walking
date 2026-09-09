import type { CountryPack, TravelerState } from "@/lib/content/schema";
import type { ActionReview } from "@/lib/traveler/action-preview";
import { reviewPoseAt } from "@/lib/traveler/action-preview";
import { STEP_DURATION_SECONDS, type TravelerMotionAction, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { CLIP_DURATIONS, type CharacterClip } from "./manifest";
import type { CharacterCue } from "./timeline";
import { waitingBehaviorAt } from "@/lib/presence/waiting";

export type ProductCharacterScene = {
  traveler: CharacterCue;
  resident: CharacterCue;
  showResident: boolean;
  conversation: boolean;
  travelerLeanRadians?: number;
};

const BRISK_PACE_THRESHOLD = 3;
const BRISK_WALK_TIME_SCALE = 1.25;
const BRISK_FORWARD_LEAN_RADIANS = 2 * Math.PI / 180;

const clipForState = (state: TravelerState): CharacterClip => {
  const clips: Partial<Record<TravelerState, CharacterClip>> = {
    loading: "idle",
    idle: "idle",
    start_walk: "walk",
    walk: "walk",
    slow_walk: "stop",
    stop: "stop",
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
    goodbye: "goodbye",
    resume_walk: "resume",
  };
  return clips[state] ?? "idle";
};

const scaledCue = (clip: CharacterClip, elapsed: number, duration: number): CharacterCue => ({
  clip,
  seconds: Math.max(0, Math.min(CLIP_DURATIONS[clip] - 1e-5, elapsed / Math.max(1e-5, duration) * CLIP_DURATIONS[clip])),
});

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

function encounterCue(pack: CountryPack, action: TravelerMotionAction): ProductCharacterScene {
  const lines = pack.encounters[0]?.lines ?? [];
  const elapsed = action.elapsedSeconds;
  let cursor = 0;
  const segment = (duration: number, travelerClip: CharacterClip, residentClip: CharacterClip) => {
    const local = elapsed - cursor;
    cursor += duration;
    if (elapsed >= cursor) return null;
    return {
      traveler: scaledCue(travelerClip, local, duration),
      resident: scaledCue(residentClip, local, duration),
      showResident: true,
      conversation: true,
    } satisfies ProductCharacterScene;
  };

  let cue = segment(0.6, "notice", "idle");
  if (cue) return cue;
  cue = segment(0.6, "stop", "idle");
  if (cue) return cue;
  cue = segment(1.2, "walk", "idle");
  if (cue) return cue;
  cue = segment(2.5, "greet", "greet");
  if (cue) return cue;

  for (const line of lines) {
    const duration = (line.durationMs ?? 4_500) / 1_000;
    cue = segment(duration, line.speaker === "traveler" ? "talk" : "listen", line.speaker === "traveler" ? "listen" : "talk");
    if (cue) return cue;
  }
  cue = segment(2.5, "react", "listen");
  if (cue) return cue;
  cue = segment(2.5, "goodbye", "goodbye");
  if (cue) return cue;

  return {
    traveler: scaledCue("resume", Math.max(0, elapsed - cursor), Math.max(0.1, action.durationSeconds - cursor)),
    resident: { clip: "idle", seconds: 0 },
    showResident: true,
    conversation: true,
  };
}

function actionCue(action: TravelerMotionAction): ProductCharacterScene {
  const entryDuration = 0.45;
  const exitDuration = 0.65;
  const elapsed = action.elapsedSeconds;
  let traveler: CharacterCue;
  if (elapsed < entryDuration) {
    traveler = scaledCue("stop", elapsed, entryDuration);
  } else if (elapsed >= action.durationSeconds - exitDuration) {
    traveler = scaledCue("resume", elapsed - action.durationSeconds + exitDuration, exitDuration);
  } else {
    const clip = action.kind === "wave" ? "greet" : clipForState(action.state);
    traveler = scaledCue(clip, elapsed - entryDuration, Math.max(0.1, action.durationSeconds - entryDuration - exitDuration));
  }
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
): ProductCharacterScene {
  const localReview = review ? reviewCue(review, now) : null;
  if (localReview) return localReview;
  if (!traveling) {
    const waiting = waitingBehaviorAt(waitedSeconds);
    const clip = clipForState(waiting.state);
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
  if (motion.action?.kind === "encounter") return encounterCue(pack, motion.action);
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
      clip: "walk",
      seconds: visualLocomotionSeconds % CLIP_DURATIONS.walk,
      timeScale: brisk ? BRISK_WALK_TIME_SCALE : 1,
    },
    resident: { clip: "idle", seconds: 0 },
    showResident: false,
    conversation: false,
    travelerLeanRadians: brisk ? BRISK_FORWARD_LEAN_RADIANS : 0,
  };
}
