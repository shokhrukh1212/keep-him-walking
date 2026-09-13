import { CHARACTER_MANIFEST, type ResidentType } from "@/lib/characters/manifest";
import { GAIT_CYCLE_SECONDS, METRES_PER_SECOND } from "@/lib/traveler/pace";
import { deterministicVariant } from "./route-clock";

/**
 * People passing on his pavement. A pass is one person who enters beyond the right edge
 * of the screen, strolls along the street just behind him and leaves beyond the left
 * edge, always facing the way they walk.
 *
 * When a pass starts is a pure function of the authoritative second, so every viewer
 * sees the same person set off at the same moment. Where they are after that is
 * integrated frame by frame from their own steps. Their feet stand on the painted street
 * above the moving pavement, which never carries them (owner decision, 13 September
 * 2026): they cross at their own slow pace, clearly slower than his. A walker is removed
 * only once it has walked out of view, never by a schedule window or by what he is doing,
 * which is what once made people vanish in the middle of the screen.
 */

/**
 * Passes are scheduled per 150-second block of active-walking time, so someone
 * passes every two to three walking minutes and nobody sets off while he is stopped.
 */
export const WALKER_BLOCK_SECONDS = 150;
/** A frame that skips more watched time than this starts nobody, who would otherwise enter late. */
export const WALKER_MAX_CATCH_UP_SECONDS = 2;
/** How far past the screen edge, in metres at his depth, a whole body with a swinging arm is out of view. */
export const WALKER_EDGE_MARGIN_METRES = 0.9;
/** A walker leaves only after clearing its entry point by this much, so it is not removed as it enters. */
const WALKER_EXIT_HYSTERESIS_METRES = 0.25;
/** An eye-level street painting puts the horizon 1.6 m above his feet (docs/plan/02 §3). */
const EYE_HEIGHT_METRES = 1.6;
/** Nobody on his pavement is drawn taller than this fraction of him. */
export const WALKER_MAX_HEIGHT_RATIO = 0.95;
/**
 * Their strolling pace (owner decision, 13 September 2026). The man's walk take has
 * longer steps, so he needs a little more speed to step at the woman's relaxed rhythm.
 */
export const WALKER_SPEEDS: Readonly<Record<ResidentType, number>> = {
  "resident-a": 1,
  "resident-b": 1.15,
};
/** Two people strolling in the lane never come closer than this, centre to centre. */
export const WALKER_MIN_GAP_METRES = 1.2;
/** How much a gap must reopen before someone who stopped behind another sets off again. */
const WALKER_RESUME_GAP_METRES = 0.4;
/**
 * The lane just behind him. `depthScale` is the perspective of someone a little further
 * away: it sets size and foot height together, the pair of cues that reads as distance.
 * `z` only sorts them behind him for the orthographic camera.
 */
export const WALKER_LANE = { depthScale: 0.9, z: -0.8 } as const;

export function walkerSpeedMetresPerSecond(type: ResidentType): number {
  return WALKER_SPEEDS[type];
}

/** How far a resident's own walk take carries its feet per second of natural playback. */
export function walkerTakeMetresPerSecond(type: ResidentType): number {
  const resident = CHARACTER_MANIFEST.residents[type];
  if (resident.walkMetresPerSecond) return resident.walkMetresPerSecond;
  // Without a measurement, assume the traveler's take scaled to their height.
  const traveler = CHARACTER_MANIFEST.traveler;
  return (traveler.walkMetresPerSecond ?? METRES_PER_SECOND) * resident.heightMetres / traveler.heightMetres;
}

/** Camera metres at his depth, where his feet are y = 0 and 1 unit is 1 m of him. */
export type WalkerPlacement = { scale: number; footY: number; z: number };

/**
 * Perspective sets the foot line; the drawn scale follows it but is capped, so someone
 * passing still reads as a little smaller than him.
 */
export function walkerPlacement(heightMetres: number, travelerHeightMetres: number): WalkerPlacement {
  const cap = WALKER_MAX_HEIGHT_RATIO * travelerHeightMetres / heightMetres;
  return {
    scale: Math.min(WALKER_LANE.depthScale, cap),
    footY: (1 - WALKER_LANE.depthScale) * EYE_HEIGHT_METRES,
    z: WALKER_LANE.z,
  };
}

export type WalkerPass = {
  /** The same for every viewer: `<block>:<slot>`. */
  id: string;
  startSecond: number;
  /** 0 leads its block; 1 follows a few seconds later. */
  slot: 0 | 1;
};

/**
 * A roll of 0–100. `deterministicVariant` multiplies by an odd constant, so for a
 * power-of-two count its result depends only on the low bits of the index: a count of
 * 2 simply alternates block by block. A prime count reaches every bit of the hash.
 */
function roll(key: string, index: number): number {
  return deterministicVariant(key, index, 101);
}

function passInBlock(block: number, slot: 0 | 1, seed: string): WalkerPass {
  const leadStart = block * WALKER_BLOCK_SECONDS + deterministicVariant(`${seed}:walker-start`, block, 31);
  return {
    id: `${block}:${slot}`,
    startSecond: slot === 0 ? leadStart : leadStart + 5 + deterministicVariant(`${seed}:walker-follow`, block, 5),
    slot,
  };
}

/**
 * Passes whose start falls in (fromSecond, toSecond] of active-walking time. The lead
 * of each block starts 0–30 s into it, so gaps run 120–180 s; about half the blocks send
 * a second person where the tier allows two. Nobody sets off at night, and a jump in the
 * clock starts nobody: a pass that began before this viewer saw the street is not shown.
 */
export function walkerPassesBetween(
  fromSecond: number, toSecond: number, localHour: number, seed: string, tierLimit: number,
): WalkerPass[] {
  if (tierLimit <= 0 || ![fromSecond, toSecond, localHour].every(Number.isFinite)) return [];
  if (!(toSecond > fromSecond) || toSecond - fromSecond > WALKER_MAX_CATCH_UP_SECONDS) return [];
  const hour = ((localHour % 24) + 24) % 24;
  if (hour < 5 || hour >= 22) return [];
  const passes: WalkerPass[] = [];
  const lastBlock = Math.floor(Math.max(0, toSecond) / WALKER_BLOCK_SECONDS);
  for (let block = Math.floor(Math.max(0, fromSecond) / WALKER_BLOCK_SECONDS); block <= lastBlock; block += 1) {
    const count = Math.min(tierLimit, roll(`${seed}:walker-count`, block) < 50 ? 2 : 1);
    for (let slot = 0; slot < count; slot += 1) {
      const pass = passInBlock(block, slot === 0 ? 0 : 1, seed);
      if (pass.startSecond > fromSecond && pass.startSecond <= toSecond) passes.push(pass);
    }
  }
  return passes;
}

export type StreetWalker = {
  /** Camera metres from the centre of the screen, at his depth. They only ever decrease. */
  x: number;
  speedMetresPerSecond: number;
  /** Metres their walk take carries its feet per second of natural playback, at their height. */
  takeMetresPerSecond: number;
  /** Seconds into the nominal walk cycle, advanced only by their own steps. */
  gaitSeconds: number;
  /** Stopped behind someone ahead, until the gap reopens. */
  waiting: boolean;
};

/** Places someone just beyond the right edge, about to stroll left. */
export function enterWalker(
  speedMetresPerSecond: number, takeMetresPerSecond: number, viewWidthMetres: number,
): StreetWalker | null {
  if (![speedMetresPerSecond, takeMetresPerSecond, viewWidthMetres].every(Number.isFinite)
    || !(speedMetresPerSecond > 0) || !(takeMetresPerSecond > 0)) return null;
  return {
    x: viewWidthMetres / 2 + WALKER_EDGE_MARGIN_METRES,
    speedMetresPerSecond,
    takeMetresPerSecond,
    gaitSeconds: 0,
    waiting: false,
  };
}

/** Metres per second across the screen. Only their own steps move them. */
export function walkerScreenSpeed(walker: StreetWalker, placement: WalkerPlacement): number {
  return walker.speedMetresPerSecond * placement.scale;
}

/**
 * One frame of their own walking. Their take carries its feet `takeMetresPerSecond` per
 * clip second at their height, and the anchor scale shrinks their steps and their travel
 * alike, so advancing the gait by the metres walked keeps the feet planted.
 * Someone standing still, to wave back or to wait, neither moves nor steps.
 */
export function advanceWalker(
  walker: StreetWalker, dtSeconds: number, placement: WalkerPlacement, standing = false,
): StreetWalker {
  if (standing || !(dtSeconds > 0)) return walker;
  const metres = walker.speedMetresPerSecond * dtSeconds;
  return {
    ...walker,
    x: walker.x - metres * placement.scale,
    gaitSeconds: (walker.gaitSeconds + metres / walker.takeMetresPerSecond) % GAIT_CYCLE_SECONDS,
  };
}

/** Whether the walker has walked out beyond an edge and can be removed without being seen to go. */
export function walkerHasLeft(walker: StreetWalker, viewWidthMetres: number): boolean {
  return !Number.isFinite(walker.x)
    || Math.abs(walker.x) > viewWidthMetres / 2 + WALKER_EDGE_MARGIN_METRES + WALKER_EXIT_HYSTERESIS_METRES;
}

/**
 * Whether someone walking at `followerSpeed` can set off behind the person furthest
 * back and never close to less than the minimum gap before that person leaves. A slower
 * follower only opens the gap.
 */
export function walkerCanFollow(
  rearmost: StreetWalker | undefined, followerSpeed: number, placement: WalkerPlacement, viewWidthMetres: number,
): boolean {
  if (!rearmost) return true;
  const entry = viewWidthMetres / 2 + WALKER_EDGE_MARGIN_METRES;
  const gap = entry - rearmost.x;
  if (!(gap >= WALKER_MIN_GAP_METRES)) return false;
  const closing = (followerSpeed - rearmost.speedMetresPerSecond) * placement.scale;
  if (closing <= 0) return true;
  const exit = entry + WALKER_EXIT_HYSTERESIS_METRES;
  const secondsToLeave = (rearmost.x + exit) / walkerScreenSpeed(rearmost, placement);
  return gap - closing * secondsToLeave >= WALKER_MIN_GAP_METRES;
}

/**
 * Someone who has come up too close behind the person ahead, who stopped to wave back,
 * waits until the gap has comfortably reopened rather than walking through them.
 */
export function walkerMustWait(walker: StreetWalker, ahead: StreetWalker | undefined): boolean {
  if (!ahead) return false;
  const needed = WALKER_MIN_GAP_METRES + (walker.waiting ? WALKER_RESUME_GAP_METRES : 0);
  return walker.x - ahead.x < needed;
}
