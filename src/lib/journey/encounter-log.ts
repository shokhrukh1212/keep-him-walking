import type { CountryPack, DialogueLine } from "@/lib/content/schema";
import type { ScheduledActionView } from "@/lib/contracts";
import { conversationScript, conversationSpeakerName } from "@/lib/world/activities";
import { activeWalkingSecondsAt, scenePositionAt } from "@/lib/world/route-clock";
import type { WalkingClock } from "@/lib/world/types";

/** The Journey modal lists this many of the latest conversations, each collapsed. */
export const ENCOUNTER_LOG_LIMIT = 3;

export type PlayedEncounter = {
  key: string;
  atActiveSecond: number;
  scriptId: string;
  speakerName: string;
  /** The place he was walking through when it began. */
  placeLabel: string | null;
  lines: readonly DialogueLine[];
};

/**
 * Conversations the server scheduled that have already begun, newest first. Only
 * shared rows count, so every viewer lists the same exchanges; a wordless greeting
 * is not listed.
 */
export function playedEncounters(
  pack: CountryPack,
  rows: readonly ScheduledActionView[],
  rawSeconds: number,
  clock: WalkingClock | null = null,
): PlayedEncounter[] {
  const played: PlayedEncounter[] = [];
  for (const row of rows) {
    if (row.kind !== "conversation" || row.cancelled || !(row.atActiveSecond <= rawSeconds)) continue;
    const script = conversationScript(pack, row.variant);
    if (!script || script.lines.length === 0) continue;
    const walkingSeconds = activeWalkingSecondsAt(row.atActiveSecond, rows, clock);
    const zone = pack.route.zones[scenePositionAt(pack, walkingSeconds).zoneIndex];
    played.push({
      key: row.occurrenceKey ?? `${row.atActiveSecond}:${script.id}`,
      atActiveSecond: row.atActiveSecond,
      scriptId: script.id,
      speakerName: conversationSpeakerName(pack, script),
      placeLabel: zone?.label ?? null,
      lines: script.lines,
    });
  }
  return played.sort((left, right) => right.atActiveSecond - left.atActiveSecond);
}

/**
 * Keeps the newest few across payloads, so a conversation stays listed after its
 * row ages out of the reactions window. Nothing new returns the same array.
 */
export function mergeEncounterLog(
  log: PlayedEncounter[],
  played: readonly PlayedEncounter[],
  limit = ENCOUNTER_LOG_LIMIT,
): PlayedEncounter[] {
  const known = new Set(log.map((entry) => entry.key));
  const fresh = played.filter((entry) => !known.has(entry.key));
  if (fresh.length === 0) return log;
  return [...fresh, ...log]
    .sort((left, right) => right.atActiveSecond - left.atActiveSecond)
    .slice(0, limit);
}
