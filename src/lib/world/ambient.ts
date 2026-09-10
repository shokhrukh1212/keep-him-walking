import { deterministicVariant } from "./route-clock";
import { nightMix } from "./time-grade";

/**
 * Everything that happens in the world on its own, scheduled from the one clock
 * the server owns. No function here calls Math.random or reads the wall clock:
 * two viewers at the same authoritative second see the same bird in the same
 * place, which is what makes "you are watching the same thing" true.
 */

/** Birds cross in a loose group every 40-90 s. */
const BIRD_CYCLE_SECONDS = 65;
const BIRD_WINDOW_SECONDS = 25;

export type BirdFlight = {
  /** 0 before it enters, 1 once it has left; only 0..1 is on screen. */
  progress: number;
  /** Fraction of the sky height, 0 at the top. */
  height: number;
  direction: 1 | -1;
  scale: number;
  /** Wingbeat phase in 0..1, so a three-frame cycle is Math.floor(phase * 3). */
  wing: number;
};

export function birdFlights(activeSecond: number, seed: string, limit: number, windScale = 1): BirdFlight[] {
  if (limit <= 0 || !Number.isFinite(activeSecond)) return [];
  const second = Math.max(0, activeSecond);
  const flight = Math.floor(second / BIRD_CYCLE_SECONDS);
  const offset = second - flight * BIRD_CYCLE_SECONDS;
  const start = deterministicVariant(`${seed}:bird-start`, flight, BIRD_WINDOW_SECONDS);
  // Wind carries them across faster, the same factor the motes and rain use.
  const wind = Math.min(1.8, Math.max(0.75, windScale));
  const duration = (9 + deterministicVariant(`${seed}:bird-duration`, flight, 6)) / wind;
  const count = Math.min(limit, 2 + deterministicVariant(`${seed}:bird-count`, flight, 3));
  const direction: 1 | -1 = deterministicVariant(`${seed}:bird-direction`, flight, 2) === 0 ? 1 : -1;

  const birds: BirdFlight[] = [];
  for (let index = 0; index < count; index += 1) {
    // A stagger so they read as a skein rather than a rank.
    const lead = index * 0.42;
    const progress = (offset - start - lead) / duration;
    if (progress < 0 || progress > 1) continue;
    birds.push({
      progress,
      height: 0.08 + deterministicVariant(`${seed}:bird-height`, flight * 8 + index, 22) / 100,
      direction,
      scale: 0.7 + deterministicVariant(`${seed}:bird-scale`, flight * 8 + index, 6) / 10,
      wing: (second * 6 + index * 0.37) % 1,
    });
  }
  return birds;
}

/** The cat sits on a wall for twenty seconds roughly every six minutes. */
const CAT_CYCLE_SECONDS = 360;
const CAT_VISIBLE_SECONDS = 20;

export type CatAppearance = { visible: boolean; progress: number; frame: number; lane: number };

export function catAppearance(activeSecond: number, seed: string): CatAppearance {
  const hidden: CatAppearance = { visible: false, progress: 0, frame: 0, lane: 0 };
  if (!Number.isFinite(activeSecond)) return hidden;
  const second = Math.max(0, activeSecond);
  const cycle = Math.floor(second / CAT_CYCLE_SECONDS);
  const offset = second - cycle * CAT_CYCLE_SECONDS;
  const start = deterministicVariant(`${seed}:cat`, cycle, CAT_CYCLE_SECONDS - CAT_VISIBLE_SECONDS);
  if (offset < start || offset >= start + CAT_VISIBLE_SECONDS) return hidden;
  const progress = (offset - start) / CAT_VISIBLE_SECONDS;
  return {
    visible: true,
    progress,
    // Four-frame idle loop at roughly three frames a second.
    frame: Math.floor(((offset - start) * 3) % 4),
    lane: deterministicVariant(`${seed}:cat-lane`, cycle, 100) / 100,
  };
}

/**
 * How many people are out. Zero in the dead of night, busiest in the early
 * afternoon; the tier is a hard ceiling, so a low-end device gets none.
 */
const WALKERS_BY_HOUR = [1, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 1];

export function walkerPopulation(localHour: number, tierLimit: number): number {
  if (tierLimit <= 0 || !Number.isFinite(localHour)) return 0;
  const hour = ((localHour % 24) + 24) % 24;
  const low = Math.floor(hour);
  const high = (low + 1) % 24;
  const blend = hour - low;
  const value = WALKERS_BY_HOUR[low]! * (1 - blend) + WALKERS_BY_HOUR[high]! * blend;
  return Math.min(tierLimit, Math.round(value));
}

/** Steam rises from the cafe continuously; three puffs share one rising cycle. */
export type SteamPuff = { progress: number; drift: number };

export function steamPuffs(activeSecond: number, count = 3): SteamPuff[] {
  if (!Number.isFinite(activeSecond) || count <= 0) return [];
  const second = Math.max(0, activeSecond);
  const puffs: SteamPuff[] = [];
  for (let index = 0; index < count; index += 1) {
    const progress = ((second * 0.28 + index / count) % 1 + 1) % 1;
    puffs.push({ progress, drift: Math.sin(second * 0.6 + index * 2.1) });
  }
  return puffs;
}

/** A tram silhouette crosses the arrival zone, for packs that opt in. */
const TRAM_CYCLE_SECONDS = 150;
const TRAM_DURATION_SECONDS = 7;

export type TramPass = { active: boolean; progress: number; direction: 1 | -1 };

export function tramPass(activeSecond: number, seed: string): TramPass {
  const idle: TramPass = { active: false, progress: 0, direction: 1 };
  if (!Number.isFinite(activeSecond)) return idle;
  const second = Math.max(0, activeSecond);
  const cycle = Math.floor(second / TRAM_CYCLE_SECONDS);
  const offset = second - cycle * TRAM_CYCLE_SECONDS;
  const start = deterministicVariant(`${seed}:tram`, cycle, TRAM_CYCLE_SECONDS - TRAM_DURATION_SECONDS);
  if (offset < start || offset >= start + TRAM_DURATION_SECONDS) return idle;
  return {
    active: true,
    progress: (offset - start) / TRAM_DURATION_SECONDS,
    direction: deterministicVariant(`${seed}:tram-direction`, cycle, 2) === 0 ? 1 : -1,
  };
}

/**
 * Bunting goes up once the server has confirmed a hundred people were watching
 * at the same moment. It is never guessed from a local count.
 */
export function buntingVisible(hundredWatchersAt: string | null | undefined, now: Date): boolean {
  if (!hundredWatchersAt) return false;
  const at = new Date(hundredWatchersAt).getTime();
  return Number.isFinite(at) && now.getTime() >= at;
}

/** Window lights follow the same dusk ramp as the night painting. */
export function windowLightAlpha(localHour: number): number {
  if (!Number.isFinite(localHour)) return 0;
  return nightMix(localHour);
}

/** Which walker waves back when a crowd wave fires, or -1 when nobody does. */
export function wavingWalker(activeSecond: number, seed: string, population: number): number {
  if (population <= 0 || !Number.isFinite(activeSecond)) return -1;
  return deterministicVariant(`${seed}:wave-back`, Math.floor(Math.max(0, activeSecond)), population);
}
