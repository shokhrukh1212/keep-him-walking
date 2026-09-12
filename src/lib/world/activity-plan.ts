import { storyBeatPlaceTag, type ConversationScript, type CountryPack, type RouteZone } from "@/lib/content/schema";
import type { ScheduledActionView } from "@/lib/contracts";
import { placeTagsOf } from "@/lib/content/places";
import {
  OWN_ACTION_KINDS,
  actionDurationSeconds,
  activityWindow,
  conversationDurationSeconds,
  conversationScripts,
  type ActivityKind,
  type OwnActionKind,
} from "./activities";
import { deterministicVariant, sceneVisitSecondsFor, scenePositionAt } from "./route-clock";

/**
 * The shared plan of his stops, in active-walking seconds. Every value here is a
 * pure function of the pinned pack and the day's id, so any server instance that
 * plans the same occurrence plans it identically. Stops do not consume walking
 * seconds, so a stop never pushes a later slot around; a missed slot is simply
 * gone, never queued.
 */

/** A conversation about every five walking minutes. */
export const CONVERSATION_PERIOD_SECONDS = 300;
export const CONVERSATION_FIRST_SECONDS = 150;
/** One of his own actions every four to six walking minutes, halfway between conversations. */
export const ACTION_PERIOD_SECONDS = 300;
export const ACTION_FIRST_SECONDS = 300;
/** Deterministic shared variation around each slot. */
export const SLOT_JITTER_SECONDS = 30;
/** A slot this close to a story or the daily stumble gives way to it. */
export const STORY_CLEARANCE_SECONDS = 90;
/** Every third conversation is a wordless greeting, so reviewed words never repeat back to back. */
export const GREETING_EVERY = 3;
/** A stop is written to the database once it is this close, so every viewer learns of it first. */
export const MIN_SCHEDULE_LEAD_SECONDS = 20;
export const MAX_SCHEDULE_LEAD_SECONDS = 75;
/** A marathon cheer is only offered for this long after the distance is crossed. */
const CHEER_WINDOW_SECONDS = 120;
const STUMBLE_EARLIEST_SECONDS = 1_800;
const STUMBLE_SPAN_SECONDS = 3_600;

const STORY_OFFSET_SECONDS = { arrival: 20, encounter: 90, food: 60, landmark: 60 } as const;

export type PlannedActivity = {
  occurrenceKey: string;
  kind: ActivityKind;
  source: "beat" | "system";
  variant: string | null;
  walkingSecond: number;
  durationSeconds: number;
};

export type ScheduleCandidate = PlannedActivity & { atActiveSecond: number };

function token(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
}

function jitter(seed: string, stream: string, index: number): number {
  return deterministicVariant(`${seed}:${stream}`, index, SLOT_JITTER_SECONDS * 2 + 1) - SLOT_JITTER_SECONDS;
}

export { placeTagsOf } from "@/lib/content/places";

function placeAt(pack: CountryPack, walkingSecond: number): RouteZone {
  return pack.route.zones[scenePositionAt(pack, walkingSecond).zoneIndex]!;
}

export function conversationSlotSecond(seed: string, index: number): number {
  return CONVERSATION_FIRST_SECONDS + index * CONVERSATION_PERIOD_SECONDS + jitter(seed, "conversation", index);
}

export function actionSlotSecond(seed: string, index: number): number {
  return ACTION_FIRST_SECONDS + index * ACTION_PERIOD_SECONDS + jitter(seed, "action", index);
}

export function stumbleSecond(seed: string): number {
  return STUMBLE_EARLIEST_SECONDS + deterministicVariant(`${seed}:stumble`, 0, STUMBLE_SPAN_SECONDS);
}

function shuffled<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = deterministicVariant(seed, index, index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

/** Alternate the eligible drink/photo actions without an immediate repeat. */
export function ownActionKind(seed: string, index: number): OwnActionKind {
  const size = OWN_ACTION_KINDS.length;
  const safeIndex = Math.max(0, Math.floor(index));
  const offset = deterministicVariant(`${seed}:actions`, 0, size);
  return OWN_ACTION_KINDS[(offset + safeIndex) % size]!;
}

/** The once-a-day stories, each on the first visit to the first place carrying its tag. */
export function storyActivities(pack: CountryPack): PlannedActivity[] {
  if (pack.schemaVersion !== 3) return [];
  const visitSeconds = sceneVisitSecondsFor(pack);
  const scripts = conversationScripts(pack);
  const story = scripts.find((script) => script.role === "story") ?? null;
  return pack.storyBeats.flatMap((beat): PlannedActivity[] => {
    if (beat.kind === "departure") return [];
    const tag = storyBeatPlaceTag(beat);
    const placeIndex = tag ? pack.route.zones.findIndex((zone) => placeTagsOf(zone).includes(tag)) : -1;
    if (placeIndex < 0) return [];
    const walkingSecond = placeIndex * visitSeconds + STORY_OFFSET_SECONDS[beat.kind];
    const occurrenceKey = `beat:${token(beat.id)}`;
    if (beat.kind === "encounter") {
      if (!story) return [];
      return [{
        occurrenceKey,
        kind: "conversation",
        source: "beat",
        variant: story.id,
        walkingSecond,
        durationSeconds: conversationDurationSeconds(story.lines),
      }];
    }
    const kind = beat.kind === "arrival" ? "wave" : beat.kind === "food" ? "drink" : "photo";
    return [{
      occurrenceKey,
      kind,
      source: "beat",
      variant: null,
      walkingSecond,
      durationSeconds: actionDurationSeconds(kind),
    }];
  }).sort((left, right) => left.walkingSecond - right.walkingSecond);
}

type ConversationChoice = { script: ConversationScript | null };

function eligibleAt(script: ConversationScript, zone: RouteZone): boolean {
  return script.placeTags.length === 0 || script.placeTags.some((tag) => placeTagsOf(zone).includes(tag));
}

function sharesWords(left: ConversationScript | null, right: ConversationScript): boolean {
  if (!left) return false;
  const words = new Set(left.lines.map((line) => line.text));
  return right.lines.some((line) => words.has(line.text));
}

/**
 * Chooses every conversation slot up to `lastIndex` in order, because each choice
 * depends on the one before: the rotation never plays the same script, or any of
 * the same words, twice in a row, and a script only plays where it makes sense.
 */
function conversationChoices(
  pack: CountryPack,
  seed: string,
  lastIndex: number,
  blockers: readonly PlannedActivity[],
): Array<ConversationChoice | null> {
  const ambient = conversationScripts(pack).filter((script) => script.role === "ambient");
  const rotation = shuffled(ambient, `${seed}:scripts`);
  const storyTimes = blockers.filter((item) => item.kind === "conversation");
  const scripts = conversationScripts(pack);
  const choices: Array<ConversationChoice | null> = [];
  const scriptedIndices: number[] = [];
  let previous: ConversationScript | null = null;
  let previousSecond = Number.NEGATIVE_INFINITY;
  let pointer = 0;
  for (let index = 0; index <= lastIndex; index += 1) {
    const second = conversationSlotSecond(seed, index);
    for (const story of storyTimes) {
      if (story.walkingSecond > previousSecond && story.walkingSecond <= second) {
        const storyScript = scripts.find((script) => script.id === story.variant) ?? null;
        // The story is fixed, so the script just before it gives way to a wordless
        // greeting rather than say the same words twice in a row.
        while (storyScript && scriptedIndices.length > 0) {
          const nearest = scriptedIndices.at(-1)!;
          const before = choices[nearest]?.script ?? null;
          if (!before || (before.id !== storyScript.id && !sharesWords(before, storyScript))) break;
          choices[nearest] = { script: null };
          scriptedIndices.pop();
        }
        previous = storyScript ?? previous;
      }
    }
    previousSecond = second;
    if (blockers.some((item) => Math.abs(item.walkingSecond - second) < STORY_CLEARANCE_SECONDS)) {
      choices.push(null);
      continue;
    }
    if (index % GREETING_EVERY === GREETING_EVERY - 1 || rotation.length === 0) {
      choices.push({ script: null });
      continue;
    }
    const zone = placeAt(pack, second);
    let chosen: ConversationScript | null = null;
    for (let offset = 0; offset < rotation.length; offset += 1) {
      const candidate = rotation[(pointer + offset) % rotation.length]!;
      if (!eligibleAt(candidate, zone) || candidate.id === previous?.id || sharesWords(previous, candidate)) continue;
      chosen = candidate;
      pointer = (pointer + offset + 1) % rotation.length;
      break;
    }
    choices.push({ script: chosen });
    if (chosen) {
      previous = chosen;
      scriptedIndices.push(index);
    }
  }
  return choices;
}

/** Every planned stop whose walking second falls in [fromSecond, toSecond). */
export function plannedActivitiesBetween(
  pack: CountryPack,
  seed: string,
  fromSecond: number,
  toSecond: number,
): PlannedActivity[] {
  if (pack.schemaVersion !== 3 || !(toSecond > fromSecond)) return [];
  const from = Math.max(0, fromSecond);
  const stories = storyActivities(pack);
  const stumble: PlannedActivity = {
    occurrenceKey: "stumble",
    kind: "stumble",
    source: "system",
    variant: null,
    walkingSecond: stumbleSecond(seed),
    durationSeconds: actionDurationSeconds("stumble"),
  };
  const blockers = [...stories, stumble];
  const planned: PlannedActivity[] = blockers.filter((item) => item.walkingSecond >= from && item.walkingSecond < toSecond);

  const lastConversation = Math.max(-1, Math.ceil((toSecond - CONVERSATION_FIRST_SECONDS + SLOT_JITTER_SECONDS) / CONVERSATION_PERIOD_SECONDS));
  const choices = conversationChoices(pack, seed, lastConversation, blockers);
  choices.forEach((choice, index) => {
    if (!choice) return;
    const walkingSecond = conversationSlotSecond(seed, index);
    if (walkingSecond < from || walkingSecond >= toSecond) return;
    planned.push({
      occurrenceKey: `conversation:${index}`,
      kind: choice.script ? "conversation" : "greeting",
      source: "system",
      variant: choice.script?.id ?? null,
      walkingSecond,
      durationSeconds: conversationDurationSeconds(choice.script?.lines ?? []),
    });
  });

  const firstAction = Math.max(0, Math.floor((from - ACTION_FIRST_SECONDS - SLOT_JITTER_SECONDS) / ACTION_PERIOD_SECONDS));
  for (let index = firstAction; ; index += 1) {
    const walkingSecond = actionSlotSecond(seed, index);
    if (walkingSecond >= toSecond) break;
    if (walkingSecond < from) continue;
    if (blockers.some((item) => Math.abs(item.walkingSecond - walkingSecond) < STORY_CLEARANCE_SECONDS)) continue;
    const kind = ownActionKind(seed, index);
    planned.push({
      occurrenceKey: `action:${index}`,
      kind,
      source: "system",
      variant: null,
      walkingSecond,
      durationSeconds: actionDurationSeconds(kind),
    });
  }
  return planned.sort((left, right) => left.walkingSecond - right.walkingSecond);
}

export type ScheduleInput = {
  pack: CountryPack;
  /** The country-day id: the same plan for every server instance and every retry. */
  seed: string;
  globalActiveSeconds: number;
  walkingSeconds: number;
  distanceMetres: number;
  paceRate: number;
  /** Recent and upcoming rows exactly as the server returned them. */
  rows: readonly ScheduledActionView[];
  minLeadSeconds?: number;
  maxLeadSeconds?: number;
};

/** Converts a future walking second into watched time, stepping over stops already written. */
function activeSecondFor(
  globalActiveSeconds: number,
  walkingSeconds: number,
  walkingSecond: number,
  rows: readonly ScheduledActionView[],
): number {
  let at = globalActiveSeconds;
  let remaining = walkingSecond - walkingSeconds;
  const windows = rows.flatMap((row) => {
    const window = activityWindow(row);
    return window && window[1] > globalActiveSeconds ? [window] : [];
  }).sort((left, right) => left[0] - right[0]);
  for (const [start, end] of windows) {
    if (start > at + remaining) break;
    remaining -= Math.max(0, start - at);
    at = Math.max(at, end);
  }
  return at + Math.max(0, remaining);
}

/**
 * The next stop to write to the database, or null. It is offered only once it is
 * between MIN and MAX lead seconds away, so every viewer's heartbeat carries it
 * before it starts, and never when the same occurrence is already written.
 */
export function nextActivityToSchedule(input: ScheduleInput): ScheduleCandidate | null {
  const { pack, seed, rows } = input;
  if (pack.schemaVersion !== 3) return null;
  const minLead = input.minLeadSeconds ?? MIN_SCHEDULE_LEAD_SECONDS;
  const maxLead = input.maxLeadSeconds ?? MAX_SCHEDULE_LEAD_SECONDS;
  const active = Math.max(0, Number.isFinite(input.globalActiveSeconds) ? input.globalActiveSeconds : 0);
  const walking = Math.max(0, Number.isFinite(input.walkingSeconds) ? input.walkingSeconds : 0);
  const written = new Set(rows.flatMap((row) => row.occurrenceKey && !row.cancelled ? [row.occurrenceKey] : []));

  const candidates: ScheduleCandidate[] = [];
  const distance = Number.isFinite(input.distanceMetres) ? input.distanceMetres : 0;
  const cheerWindow = 1.25 * Math.max(1, Number.isFinite(input.paceRate) ? input.paceRate : 1) * CHEER_WINDOW_SECONDS;
  if (distance >= pack.marathonMetres && distance < pack.marathonMetres + cheerWindow && !written.has("cheer")) {
    const walkingSecond = walking + minLead;
    candidates.push({
      occurrenceKey: "cheer",
      kind: "cheer",
      source: "system",
      variant: null,
      walkingSecond,
      durationSeconds: actionDurationSeconds("cheer"),
      atActiveSecond: Math.ceil(activeSecondFor(active, walking, walkingSecond, rows)),
    });
  }

  for (const planned of plannedActivitiesBetween(pack, seed, walking + minLead, walking + maxLead + 1)) {
    if (written.has(planned.occurrenceKey)) continue;
    const atActiveSecond = Math.ceil(activeSecondFor(active, walking, planned.walkingSecond, rows));
    candidates.push({ ...planned, atActiveSecond });
  }

  return candidates
    .filter((candidate) => candidate.atActiveSecond - active >= minLead && candidate.atActiveSecond - active <= maxLead + 1)
    .sort((left, right) => left.atActiveSecond - right.atActiveSecond)[0] ?? null;
}
