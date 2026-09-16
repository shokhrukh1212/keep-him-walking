import type { PrelaunchMonologueLine } from "@/content/prelaunch/monologues";
import { CLIP_DURATIONS } from "@/lib/characters/manifest";
import { captionCues } from "@/lib/world/captions";
import { ANNIVERSARY_JOURNEY } from "@/lib/season/anniversary";

/**
 * The prelaunch monologue schedule, as pure functions of visible preview seconds.
 * Nothing here reads a clock: the controller passes the second it measured.
 */

/** The first line comes this long after the model is ready. */
export const PREVIEW_FIRST_DELAY_SECONDS = 5;
/** One monologue every this many visible seconds, start to start. */
export const PREVIEW_INTERVAL_SECONDS = 180;
/** The longest cue that still fits three readable lines in the narrowest phone caption band. */
export const MONOLOGUE_CUE_CHARACTERS = 72;
/** A speech is always whole takes of the existing talk animation, so its gesture completes. */
export const TALK_LOOP_SECONDS = CLIP_DURATIONS.talk;
export const MONOLOGUE_MIN_SECONDS = 10;
export const MONOLOGUE_MAX_SECONDS = 16;
const MIN_TALK_LOOPS = Math.ceil(MONOLOGUE_MIN_SECONDS / TALK_LOOP_SECONDS);
const MAX_TALK_LOOPS = Math.floor(MONOLOGUE_MAX_SECONDS / TALK_LOOP_SECONDS);
const READING_CHARACTERS_PER_SECOND = 14;
const CUE_SETTLE_SECONDS = 1;
/** A start this close to its due second keeps the exact cadence; a later one restarts it. */
const ON_TIME_SECONDS = 1;

/**
 * Splits a line into caption cues at sentence ends first, then at word boundaries.
 * Every authored word stays, in order.
 */
export function monologueCues(text: string, maxCharacters = MONOLOGUE_CUE_CHARACTERS): string[] {
  const sentences = (text.trim().match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const cues: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    for (const piece of captionCues(sentence, maxCharacters)) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (current && candidate.length > maxCharacters) {
        cues.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }
  if (current) cues.push(current);
  return cues;
}

export function cueReadingSeconds(text: string): number {
  return text.length / READING_CHARACTERS_PER_SECOND + CUE_SETTLE_SECONDS;
}

/** Comfortable reading time for the whole line, cue by cue. */
export function monologueReadingSeconds(text: string): number {
  return monologueCues(text).reduce((sum, cue) => sum + cueReadingSeconds(cue), 0);
}

export type MonologueCue = { text: string; startSeconds: number; endSeconds: number };
export type MonologueTimeline = { durationSeconds: number; talkLoops: number; cues: readonly MonologueCue[] };

/**
 * How long he speaks and when each cue shows. The duration is the fewest whole talk takes
 * that give the text its reading time, within 10–16 seconds; cues share it in proportion to
 * their reading time and cover it without a gap, so the caption is never blank mid-speech.
 */
export function monologueTimeline(text: string): MonologueTimeline {
  const cues = monologueCues(text);
  if (cues.length === 0) return { durationSeconds: 0, talkLoops: 0, cues: [] };
  const reading = cues.map(cueReadingSeconds);
  const needed = reading.reduce((sum, seconds) => sum + seconds, 0);
  const talkLoops = Math.min(MAX_TALK_LOOPS, Math.max(MIN_TALK_LOOPS, Math.ceil(needed / TALK_LOOP_SECONDS)));
  const durationSeconds = talkLoops * TALK_LOOP_SECONDS;
  let startSeconds = 0;
  return {
    durationSeconds,
    talkLoops,
    cues: cues.map((cue, index) => {
      const endSeconds = index === cues.length - 1
        ? durationSeconds
        : startSeconds + durationSeconds * reading[index]! / needed;
      const timed = { text: cue, startSeconds, endSeconds };
      startSeconds = endSeconds;
      return timed;
    }),
  };
}

export type MonologueContext = {
  cityName: string;
  /** Server-synchronized wall-clock milliseconds; null while unknown (dated lines then hold). */
  nowMs: number | null;
  /** Null while unknown. Unknown or failed is never treated as open. */
  sponsorOpen: boolean | null;
  sponsorSpoken: boolean;
  previousText: string | null;
};

export type MonologueChoice = { slot: number; id: string; text: string; sponsor: boolean };

const SCHEDULED_INSTANTS = {
  travelStart: Date.parse(ANNIVERSARY_JOURNEY.travelStartsAt),
  pollOpens: Date.parse(ANNIVERSARY_JOURNEY.poll.opensAt),
} as const;

function resolveLine(line: PrelaunchMonologueLine, slot: number, context: MonologueContext) {
  const before = line.requires?.before;
  // A dated line is never said after its moment: once past, its fallback or nothing.
  const timeHolds = before === undefined || context.nowMs === null || context.nowMs < SCHEDULED_INSTANTS[before];
  const cityHolds = line.requires?.city === undefined || line.requires.city === context.cityName;
  // The offer is made only while genuinely open, never as the first thing he says, and once.
  const sponsorHolds = line.requires?.sponsorOpen === undefined
    || (context.sponsorOpen === true && !context.sponsorSpoken && slot > 0);
  return timeHolds && cityHolds && sponsorHolds
    ? { id: line.id, text: line.text, sponsor: line.requires?.sponsorOpen === true }
    : { id: `${line.id}.fallback`, text: line.fallback ?? "", sponsor: false };
}

/** Whether the line in this slot depends on sponsorship being open. */
export function slotNeedsSponsor(lines: readonly PrelaunchMonologueLine[], slot: number): boolean {
  return lines.length > 0 && lines[slot % lines.length]?.requires?.sponsorOpen === true;
}

/**
 * The line for this slot in authored order, or its neutral fallback. A line with no text,
 * or the same text he just said, is skipped for the next one.
 */
export function chooseMonologue(
  lines: readonly PrelaunchMonologueLine[],
  slot: number,
  context: MonologueContext,
): MonologueChoice | null {
  for (let offset = 0; offset < lines.length; offset += 1) {
    const index = slot + offset;
    const resolved = resolveLine(lines[index % lines.length]!, index, context);
    if (resolved.text.trim() && resolved.text !== context.previousText) return { slot: index, ...resolved };
  }
  return null;
}

export type MonologueSpeech = MonologueChoice & { startedAt: number; timeline: MonologueTimeline };

export type MonologueSchedule = {
  /** The visible second the next monologue may start; null until the model is ready. */
  readonly nextStartAt: number | null;
  readonly speaking: MonologueSpeech | null;
  readonly nextSlot: number;
  readonly lastText: string | null;
  readonly sponsorSpoken: boolean;
  /** How many monologues have started. */
  readonly started: number;
};

export const INITIAL_MONOLOGUE_SCHEDULE: MonologueSchedule = {
  nextStartAt: null,
  speaking: null,
  nextSlot: 0,
  lastText: null,
  sponsorSpoken: false,
  started: 0,
};

/** The model is ready: the first line is due shortly after. Later calls change nothing. */
export function withModelReady(state: MonologueSchedule, at: number): MonologueSchedule {
  return state.nextStartAt === null && state.started === 0
    ? { ...state, nextStartAt: at + PREVIEW_FIRST_DELAY_SECONDS }
    : state;
}

export type MonologueStep = {
  at: number;
  /** A modal or a failed journey read holds back new starts; a speech already under way finishes. */
  deferred: boolean;
  lines: readonly PrelaunchMonologueLine[];
  cityName: string;
  sponsorOpen: boolean | null;
  /** Server-synchronized wall-clock milliseconds, for dated lines. */
  nowMs?: number | null;
};

/**
 * Ends a finished speech and starts a due one. Speeches never overlap, and a start that was
 * held back plays once when it can, with the next counted from that real start: nothing queues
 * and nothing catches up.
 */
export function advanceMonologues(state: MonologueSchedule, step: MonologueStep): MonologueSchedule {
  let next = state;
  if (next.speaking && step.at >= next.speaking.startedAt + next.speaking.timeline.durationSeconds) {
    next = { ...next, speaking: null };
  }
  if (next.speaking || next.nextStartAt === null || step.at < next.nextStartAt || step.deferred) return next;
  const choice = chooseMonologue(step.lines, next.nextSlot, {
    cityName: step.cityName,
    nowMs: step.nowMs ?? null,
    sponsorOpen: step.sponsorOpen,
    sponsorSpoken: next.sponsorSpoken,
    previousText: next.lastText,
  });
  if (!choice) return next;
  const startedAt = step.at - next.nextStartAt <= ON_TIME_SECONDS ? next.nextStartAt : step.at;
  return {
    nextStartAt: startedAt + PREVIEW_INTERVAL_SECONDS,
    speaking: { ...choice, startedAt, timeline: monologueTimeline(choice.text) },
    nextSlot: choice.slot + 1,
    lastText: choice.text,
    sponsorSpoken: next.sponsorSpoken || choice.sponsor,
    started: next.started + 1,
  };
}

export type MonologueCaption = {
  slot: number;
  id: string;
  /** The whole line, for assistive technology. */
  text: string;
  cueIndex: number;
  cueText: string;
  sponsor: boolean;
};

/** The cue on screen at this second, or null when he is not speaking. */
export function monologueCaptionAt(state: MonologueSchedule, at: number): MonologueCaption | null {
  const speech = state.speaking;
  // Absolute seconds, compared exactly as the schedule and its wake-ups compare them.
  if (!speech || at < speech.startedAt || at >= speech.startedAt + speech.timeline.durationSeconds) return null;
  const cueIndex = Math.max(0, speech.timeline.cues.findIndex((cue) => at < speech.startedAt + cue.endSeconds));
  return {
    slot: speech.slot,
    id: speech.id,
    text: speech.text,
    cueIndex,
    cueText: speech.timeline.cues[cueIndex]?.text ?? "",
    sponsor: speech.sponsor,
  };
}

/** The next second at which something visible changes: a cue, the end of a speech or the next start. */
export function nextMonologueBoundary(state: MonologueSchedule, at: number): number | null {
  const candidates: number[] = [];
  if (state.speaking) {
    for (const cue of state.speaking.timeline.cues) candidates.push(state.speaking.startedAt + cue.endSeconds);
  }
  if (state.nextStartAt !== null) candidates.push(state.nextStartAt);
  const future = candidates.filter((second) => second > at);
  return future.length > 0 ? Math.min(...future) : null;
}
