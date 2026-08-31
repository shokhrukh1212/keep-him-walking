import type { ScheduledEventView } from "@/lib/contracts";
import type { CountryPack, TravelerState } from "@/lib/content/schema";

export type ServerClock = {
  offsetMs: number;
  synchronizedAt: number;
};

export function synchronizeClock(serverNow: string, clientNow = Date.now()): ServerClock {
  return {
    offsetMs: new Date(serverNow).getTime() - clientNow,
    synchronizedAt: clientNow,
  };
}

export function estimatedServerNow(clock: ServerClock, clientNow = Date.now()): number {
  return clientNow + clock.offsetMs;
}

export function eventProgress(event: ScheduledEventView, serverNowMs: number): number {
  const start = new Date(event.startsAt).getTime();
  const duration = event.durationSeconds * 1_000;
  if (duration <= 0) return serverNowMs >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (serverNowMs - start) / duration));
}

function stringSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function deterministicAmbientAction(
  pack: CountryPack,
  serverNowMs: number,
): { state: TravelerState; label: string } | null {
  const windowSeconds = 40;
  const window = Math.floor(serverNowMs / (windowSeconds * 1_000));
  const phase = Math.floor(serverNowMs / 1_000) % windowSeconds;
  if (phase < 26 || phase > 35) return null;
  const index = stringSeed(`${pack.countryDayId}:${window}`) % pack.ambientActions.length;
  return pack.ambientActions[index] ?? null;
}

export function activeDialogueLineIndex(
  event: ScheduledEventView,
  serverNowMs: number,
): number {
  if (!event.lines?.length) return -1;
  const elapsed = Math.max(0, serverNowMs - new Date(event.startsAt).getTime());
  let cursor = 4_000;
  for (let index = 0; index < event.lines.length; index += 1) {
    cursor += event.lines[index]?.durationMs ?? 4_500;
    if (elapsed < cursor) return index;
  }
  return event.lines.length - 1;
}
