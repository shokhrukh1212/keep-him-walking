import type { TravelerState } from "@/lib/content/schema";
import { CLIP_DURATIONS, type CharacterClip } from "@/lib/characters/manifest";

export const WAITING_REST_AFTER_SECONDS = 600;

export type WaitingBehavior = {
  phase: "wait" | "look_up" | "sit" | "sleep";
  state: Extract<TravelerState, "wait" | "look_up" | "sit" | "sleep">;
  clip: CharacterClip;
  clipSeconds: number;
};

type WaitingTake = { clip: CharacterClip; phase: "wait" | "look_up" };

const FIRST_MINUTE: readonly WaitingTake[] = [
  { clip: "wait_pockets", phase: "wait" },
  { clip: "look_up", phase: "look_up" },
  { clip: "wait_pockets", phase: "wait" },
];

const LONG_WAIT: readonly WaitingTake[] = [
  { clip: "wait_pockets", phase: "wait" },
  { clip: "wait_watch", phase: "wait" },
  { clip: "wait_pockets", phase: "wait" },
  { clip: "wait_stretch", phase: "wait" },
  { clip: "wait_yawn", phase: "wait" },
  { clip: "look_up", phase: "look_up" },
];

/** Each take plays once, whole and at its own speed, before the next one in the cycle begins. */
function takeInCycle(seconds: number, cycle: readonly WaitingTake[]): WaitingBehavior {
  const length = cycle.reduce((sum, take) => sum + CLIP_DURATIONS[take.clip], 0);
  let offset = seconds % length;
  for (const take of cycle) {
    const duration = CLIP_DURATIONS[take.clip];
    if (offset < duration) return { phase: take.phase, state: take.phase, clip: take.clip, clipSeconds: offset };
    offset -= duration;
  }
  const last = cycle[cycle.length - 1]!;
  return { phase: last.phase, state: last.phase, clip: last.clip, clipSeconds: CLIP_DURATIONS[last.clip] - 1e-5 };
}

/** Pure waiting choreography from the confirmed wait duration and the city's local night flag. */
export function waitingBehaviorAt(waitedSeconds: number, isLocalNight = false): WaitingBehavior {
  const waited = Number.isFinite(waitedSeconds) ? Math.max(0, waitedSeconds) : 0;
  if (waited >= WAITING_REST_AFTER_SECONDS) {
    const seatedFor = waited - WAITING_REST_AFTER_SECONDS;
    if (seatedFor < CLIP_DURATIONS.sit_down) return { phase: "sit", state: "sit", clip: "sit_down", clipSeconds: seatedFor };
    const clip = isLocalNight ? "sleep" : "sitting";
    return {
      phase: isLocalNight ? "sleep" : "sit",
      state: isLocalNight ? "sleep" : "sit",
      clip,
      clipSeconds: (seatedFor - CLIP_DURATIONS.sit_down) % CLIP_DURATIONS[clip],
    };
  }
  return waited < 60 ? takeInCycle(waited, FIRST_MINUTE) : takeInCycle(waited - 60, LONG_WAIT);
}

export function waitedSecondsSince(waitingSince: string | null, nowMs: number): number {
  if (!waitingSince || !Number.isFinite(nowMs)) return 0;
  const waitingSinceMs = Date.parse(waitingSince);
  if (!Number.isFinite(waitingSinceMs)) return 0;
  return Math.max(0, (nowMs - waitingSinceMs) / 1_000);
}

export function formatWaitDuration(waitedSeconds: number): string {
  const totalSeconds = Math.floor(Number.isFinite(waitedSeconds) ? Math.max(0, waitedSeconds) : 0);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds % 3_600 / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function formatWaitingLocalTime(waitingSince: string, timeZone: string): string {
  const instant = new Date(waitingSince);
  if (!Number.isFinite(instant.getTime())) return "unknown time";
  try {
    return new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
  } catch {
    return "unknown time";
  }
}
