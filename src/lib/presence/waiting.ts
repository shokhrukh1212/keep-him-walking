import type { TravelerState } from "@/lib/content/schema";
import type { CharacterClip } from "@/lib/characters/manifest";

export const WAITING_REST_AFTER_SECONDS = 600;

export type WaitingBehavior = {
  phase: "wait" | "look_up" | "sit" | "sleep";
  state: Extract<TravelerState, "wait" | "look_up" | "sit" | "sleep">;
  clip: CharacterClip;
  clipSeconds: number;
};

/** Pure waiting choreography from the confirmed wait duration and the city's local night flag. */
export function waitingBehaviorAt(waitedSeconds: number, isLocalNight = false): WaitingBehavior {
  const waited = Number.isFinite(waitedSeconds) ? Math.max(0, waitedSeconds) : 0;
  if (waited >= WAITING_REST_AFTER_SECONDS) {
    const seatedFor = waited - WAITING_REST_AFTER_SECONDS;
    if (seatedFor < 2.5) return { phase: "sit", state: "sit", clip: "sit_down", clipSeconds: seatedFor };
    const clip = isLocalNight ? "sleep" : "sitting";
    return {
      phase: isLocalNight ? "sleep" : "sit",
      state: isLocalNight ? "sleep" : "sit",
      clip,
      clipSeconds: (seatedFor - 2.5) % 5,
    };
  }

  if (waited < 60) {
    const cycle = waited % 12;
    if (cycle >= 4 && cycle < 8) {
      return { phase: "look_up", state: "look_up", clip: "look_up", clipSeconds: cycle - 4 };
    }
    return { phase: "wait", state: "wait", clip: "wait_pockets", clipSeconds: cycle < 4 ? cycle : cycle - 8 };
  }

  const cycle = (waited - 60) % 24;
  if (cycle < 6) return { phase: "wait", state: "wait", clip: "wait_pockets", clipSeconds: cycle };
  if (cycle < 10) return { phase: "wait", state: "wait", clip: "wait_watch", clipSeconds: cycle - 6 };
  if (cycle < 14) return { phase: "wait", state: "wait", clip: "wait_pockets", clipSeconds: cycle - 10 };
  if (cycle < 18) return { phase: "wait", state: "wait", clip: "wait_stretch", clipSeconds: cycle - 14 };
  if (cycle < 22) return { phase: "wait", state: "wait", clip: "wait_yawn", clipSeconds: cycle - 18 };
  return { phase: "look_up", state: "look_up", clip: "look_up", clipSeconds: cycle - 22 };
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
