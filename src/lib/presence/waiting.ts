import type { TravelerState } from "@/lib/content/schema";

export const WAITING_REST_AFTER_SECONDS = 600;
const WAITING_CYCLE_SECONDS = 12;

export type WaitingBehavior = {
  phase: "idle" | "look_around" | "rest";
  state: Extract<TravelerState, "idle" | "notice" | "rest">;
  clipSeconds: number;
};

export function waitingBehaviorAt(waitedSeconds: number): WaitingBehavior {
  const waited = Number.isFinite(waitedSeconds) ? Math.max(0, waitedSeconds) : 0;
  if (waited >= WAITING_REST_AFTER_SECONDS) {
    return {
      phase: "rest",
      state: "rest",
      clipSeconds: (waited - WAITING_REST_AFTER_SECONDS) % 5,
    };
  }

  const cycle = waited % WAITING_CYCLE_SECONDS;
  if (cycle < 4) return { phase: "idle", state: "idle", clipSeconds: cycle };
  if (cycle < 8) {
    return {
      phase: "look_around",
      state: "notice",
      clipSeconds: (cycle - 4) % 1,
    };
  }
  return { phase: "idle", state: "idle", clipSeconds: cycle - 8 };
}

export function waitedSecondsSince(waitingSince: string | null, nowMs: number): number {
  if (!waitingSince || !Number.isFinite(nowMs)) return 0;
  const waitingSinceMs = Date.parse(waitingSince);
  if (!Number.isFinite(waitingSinceMs)) return 0;
  return Math.max(0, (nowMs - waitingSinceMs) / 1_000);
}

export function formatWaitDuration(waitedSeconds: number): string {
  const totalSeconds = Math.floor(
    Number.isFinite(waitedSeconds) ? Math.max(0, waitedSeconds) : 0,
  );
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
    return new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  } catch {
    return "unknown time";
  }
}
