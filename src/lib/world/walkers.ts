import { GAIT_CYCLE_SECONDS, METRES_PER_SECOND } from "@/lib/traveler/motion-clock";
import { deterministicVariant } from "./route-clock";

/**
 * People passing on his pavement. A pass is one person who enters beyond one edge of
 * the screen, walks the street at their own pace and leaves beyond the other edge.
 *
 * When a pass starts is a pure function of the authoritative second, so every viewer
 * sees the same person set off at the same moment. Where they are after that is
 * integrated frame by frame from their own steps and his distance, because the
 * pavement under them moves with him and his pace has a history no single input
 * carries. That is also why a walker is removed only once it has walked out of view:
 * its lifetime belongs to the street, never to a schedule window or to what he is
 * doing, which is what once made people vanish in the middle of the screen.
 */

/** Passes are scheduled per two-minute block of watched time. */
export const WALKER_BLOCK_SECONDS = 120;
/** A frame that skips more watched time than this starts nobody, who would otherwise enter late. */
export const WALKER_MAX_CATCH_UP_SECONDS = 2;
/** How far past the screen edge, in metres at his depth, a whole body with a swinging arm is out of view. */
export const WALKER_EDGE_MARGIN_METRES = 0.9;
/** A walker leaves only after clearing its entry point by this much, so it is not removed as it enters. */
const WALKER_EXIT_HYSTERESIS_METRES = 0.25;
/** Slower than this across the screen and a pass would hover beside him instead of passing. */
export const WALKER_MIN_SCREEN_SPEED = 0.2;
/** An eye-level street painting puts the horizon 1.6 m above his feet (docs/plan/02 §3). */
const EYE_HEIGHT_METRES = 1.6;
/** Nobody on his pavement is drawn taller than this fraction of him. */
export const WALKER_MAX_HEIGHT_RATIO = 0.95;

export type WalkerLane = "behind" | "front";
/** +1 walks the way he does, towards the right of the screen; -1 comes towards him. */
export type WalkerDirection = 1 | -1;

/**
 * Two lanes on his pavement. `depthScale` is the perspective scale of someone a little
 * further away (< 1) or nearer (> 1) than him; it sets size and foot height together,
 * the pair of cues that reads as distance. `z` only sorts them behind or in front of
 * him for the orthographic camera.
 */
export const WALKER_LANES = {
  behind: { depthScale: 0.9, z: -0.8 },
  front: { depthScale: 1.04, z: 0.8 },
} as const satisfies Record<WalkerLane, { depthScale: number; z: number }>;

/** Camera metres at his depth, where his feet are y = 0 and 1 unit is 1 m of him. */
export type WalkerPlacement = { scale: number; footY: number; z: number };

/**
 * Perspective sets the foot line; the drawn scale follows it but is capped, so someone
 * passing in front of him still reads as a little smaller than him.
 */
export function walkerPlacement(
  lane: WalkerLane, heightMetres: number, travelerHeightMetres: number,
): WalkerPlacement {
  const { depthScale, z } = WALKER_LANES[lane];
  const cap = WALKER_MAX_HEIGHT_RATIO * travelerHeightMetres / heightMetres;
  return { scale: Math.min(depthScale, cap), footY: (1 - depthScale) * EYE_HEIGHT_METRES, z };
}

export type WalkerPass = {
  /** The same for every viewer: `<block>:<slot>`. */
  id: string;
  startSecond: number;
  /** 0 leads its block; 1 follows a few seconds later in the other lane. */
  slot: 0 | 1;
  lane: WalkerLane;
  direction: WalkerDirection;
  speedMetresPerSecond: number;
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
  const leadLane: WalkerLane = roll(`${seed}:walker-lane`, block) < 50 ? "behind" : "front";
  const lane: WalkerLane = slot === 0 ? leadLane : leadLane === "behind" ? "front" : "behind";
  const key = block * 2 + slot;
  // Only someone coming towards him passes in front, so he is covered for a moment
  // rather than for the length of a stroll. Behind him half overtake: at one watcher's
  // pace they are the only people who can walk in from the left.
  const kindRoll = roll(`${seed}:walker-kind`, key);
  const kind = lane === "front" || kindRoll < 25 ? 0 : kindRoll < 50 ? 1 : 2;
  const jitter = deterministicVariant(`${seed}:walker-speed`, key, 17) / 100;
  // At his 1.25 m/s: someone coming the other way (0), a stroller he catches up with
  // (1) and a brisk walker who overtakes him (2). Nobody walks near his pace, or they
  // would hover beside him.
  const [direction, speedMetresPerSecond]: [WalkerDirection, number] = kind === 0
    ? [-1, 1.2 + jitter]
    : kind === 1 ? [1, 0.8 + jitter] : [1, 1.8 + jitter];
  return {
    id: `${block}:${slot}`,
    startSecond: slot === 0 ? leadStart : leadStart + 5 + deterministicVariant(`${seed}:walker-follow`, block, 5),
    slot,
    lane,
    direction,
    speedMetresPerSecond,
  };
}

/**
 * Passes whose start falls in (fromSecond, toSecond]. The lead of each block starts
 * 0–30 s into it, so gaps run 90–150 s; about half the blocks send a second person
 * where the tier allows two. Nobody sets off at night, and a jump in the clock starts
 * nobody: a pass that began before this viewer saw the street is not shown at all.
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
  /** On the same metre axis as his distance; the centre of the screen is his distance. */
  streetMetres: number;
  direction: WalkerDirection;
  speedMetresPerSecond: number;
  /** Seconds into the nominal walk cycle, advanced only by their own steps. */
  gaitSeconds: number;
};

/** Metres per second across the screen: their own steps plus the pavement moving under them. */
export function walkerScreenSpeed(
  direction: WalkerDirection, speedMetresPerSecond: number, placement: WalkerPlacement, groundSpeed: number,
): number {
  return direction * speedMetresPerSecond * placement.scale - groundSpeed;
}

/**
 * Places a pass just beyond the edge it will walk in from — the side it is moving
 * away from — or returns null when it would drift across so slowly that it hovers.
 */
export function enterWalker(
  pass: WalkerPass, placement: WalkerPlacement, distanceMetres: number, groundSpeed: number, viewWidthMetres: number,
): StreetWalker | null {
  const screenSpeed = walkerScreenSpeed(pass.direction, pass.speedMetresPerSecond, placement, groundSpeed);
  if (!Number.isFinite(screenSpeed) || Math.abs(screenSpeed) < WALKER_MIN_SCREEN_SPEED) return null;
  const edge = viewWidthMetres / 2 + WALKER_EDGE_MARGIN_METRES;
  return {
    streetMetres: distanceMetres + (screenSpeed < 0 ? edge : -edge),
    direction: pass.direction,
    speedMetresPerSecond: pass.speedMetresPerSecond,
    gaitSeconds: 0,
  };
}

/**
 * One frame of their own walking. His walk covers METRES_PER_SECOND per nominal clip
 * second at his height; a shorter body takes proportionally shorter steps, so the gait
 * advances by distance walked and the feet stay planted on the pavement. Someone
 * standing still, to wave back, neither moves along the street nor steps.
 */
export function advanceWalker(
  walker: StreetWalker, dtSeconds: number, placement: WalkerPlacement,
  heightMetres: number, travelerHeightMetres: number, standing = false,
): StreetWalker {
  if (standing || !(dtSeconds > 0)) return walker;
  const metres = walker.speedMetresPerSecond * dtSeconds;
  const stride = METRES_PER_SECOND * heightMetres / travelerHeightMetres;
  return {
    ...walker,
    streetMetres: walker.streetMetres + walker.direction * metres * placement.scale,
    gaitSeconds: (walker.gaitSeconds + metres / stride) % GAIT_CYCLE_SECONDS,
  };
}

/** Camera metres from the centre of the screen. */
export function walkerScreenX(walker: StreetWalker, distanceMetres: number): number {
  return walker.streetMetres - distanceMetres;
}

/** Whether the walker has walked out beyond an edge and can be removed without being seen to go. */
export function walkerHasLeft(walker: StreetWalker, distanceMetres: number, viewWidthMetres: number): boolean {
  const x = walkerScreenX(walker, distanceMetres);
  return !Number.isFinite(x)
    || Math.abs(x) > viewWidthMetres / 2 + WALKER_EDGE_MARGIN_METRES + WALKER_EXIT_HYSTERESIS_METRES;
}
