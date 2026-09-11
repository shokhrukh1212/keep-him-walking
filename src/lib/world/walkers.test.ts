import { describe, expect, it } from "vitest";
import { CHARACTER_MANIFEST, RESIDENT_TYPES } from "@/lib/characters/manifest";
import { GAIT_CYCLE_SECONDS, METRES_PER_SECOND } from "@/lib/traveler/motion-clock";
import {
  WALKER_EDGE_MARGIN_METRES, WALKER_LANES, WALKER_MAX_CATCH_UP_SECONDS, WALKER_MIN_SCREEN_SPEED,
  advanceWalker, enterWalker, walkerHasLeft, walkerPassesBetween, walkerPlacement, walkerScreenSpeed, walkerScreenX,
  type StreetWalker, type WalkerLane, type WalkerPass, type WalkerPlacement,
} from "./walkers";

const SEED = "london-v1";
const TRAVELER_HEIGHT = CHARACTER_MANIFEST.traveler.heightMetres;
/** 1440 × 900: he is 30 % of the height, 270 px, so the screen shows 9.49 m of street. */
const DESKTOP_WIDTH_METRES = (1.78 * 900 / 270) * (1440 / 900);
/** Half a body with a swinging arm: a centre nearer the middle than this is at least partly in view. */
const BODY_HALF_WIDTH_METRES = 0.6;

function passesOver(seconds: number, tierLimit: number, localHour = 13, seed = SEED, step = 1) {
  const passes: WalkerPass[] = [];
  for (let second = 0; second < seconds; second += step) {
    passes.push(...walkerPassesBetween(second, second + step, localHour, seed, tierLimit));
  }
  return passes;
}

function residentHeight(index: number) {
  return CHARACTER_MANIFEST.residents[RESIDENT_TYPES[index % RESIDENT_TYPES.length]!].heightMetres;
}

describe("walkerPassesBetween", () => {
  it("starts nobody at night or on a tier without walkers", () => {
    expect(passesOver(3600, 2, 2)).toEqual([]);
    expect(passesOver(3600, 2, 22.5)).toEqual([]);
    expect(passesOver(3600, 0)).toEqual([]);
  });

  it("starts nobody when the clock jumps, stands still or cannot be read", () => {
    const first = passesOver(600, 2)[0]!;
    expect(walkerPassesBetween(first.startSecond - 0.5, first.startSecond, 13, SEED, 2)).toHaveLength(1);
    expect(walkerPassesBetween(first.startSecond - WALKER_MAX_CATCH_UP_SECONDS - 1, first.startSecond, 13, SEED, 2))
      .toEqual([]);
    expect(walkerPassesBetween(first.startSecond, first.startSecond, 13, SEED, 2)).toEqual([]);
    expect(walkerPassesBetween(first.startSecond + 1, first.startSecond - 1, 13, SEED, 2)).toEqual([]);
    expect(walkerPassesBetween(Number.NaN, first.startSecond, 13, SEED, 2)).toEqual([]);
  });

  it("leads one pass per block, 90 to 150 watched seconds apart", () => {
    const leads = passesOver(3600, 2).filter((pass) => pass.slot === 0);
    expect(leads).toHaveLength(30);
    for (let index = 1; index < leads.length; index += 1) {
      const gap = leads[index]!.startSecond - leads[index - 1]!.startSecond;
      expect(gap).toBeGreaterThanOrEqual(90);
      expect(gap).toBeLessThanOrEqual(150);
    }
  });

  it("sends a second person only where the tier allows two, a little later and in the other lane", () => {
    expect(passesOver(3600, 1).every((pass) => pass.slot === 0)).toBe(true);
    const passes = passesOver(3600, 2);
    const followers = passes.filter((pass) => pass.slot === 1);
    expect(followers.length).toBeGreaterThan(0);
    for (const follower of followers) {
      const lead = passes.find((pass) => pass.id === follower.id.replace(/:1$/, ":0"))!;
      expect(follower.lane).not.toBe(lead.lane);
      expect(follower.startSecond - lead.startSecond).toBeGreaterThanOrEqual(5);
      expect(follower.startSecond - lead.startSecond).toBeLessThanOrEqual(10);
    }
  });

  it("passes in front of him only coming towards him, and nobody walks his way slower than him", () => {
    const passes = passesOver(7200, 2);
    const kinds = new Set<string>();
    for (const pass of passes) {
      if (pass.lane === "front") expect(pass.direction).toBe(-1);
      if (pass.direction > 0) {
        const placement = walkerPlacement(pass.lane, residentHeight(pass.slot), TRAVELER_HEIGHT);
        // Any slower and the pavement would carry them backwards while they face forwards.
        expect(pass.speedMetresPerSecond * placement.scale).toBeGreaterThanOrEqual(METRES_PER_SECOND + 0.35);
      }
      kinds.add(pass.direction < 0 ? "towards him" : "overtaking");
    }
    expect([...kinds].sort()).toEqual(["overtaking", "towards him"]);
  });

  it("is the same for every viewer, whatever their frame rate", () => {
    const ids = (step: number) => passesOver(600, 2, 13, SEED, step).map((pass) => pass.id);
    expect(ids(1 / 60)).toEqual(ids(1));
    expect(passesOver(600, 2)).toEqual(passesOver(600, 2));
  });

  it("gives two cities different streets", () => {
    const street = (seed: string) => passesOver(1800, 2, 13, seed).map((pass) => pass.startSecond).join(",");
    expect(street("paris-v1")).not.toBe(street("london-v1"));
  });
});

describe("walkerPlacement", () => {
  it("draws both residents a little smaller than him, in either lane", () => {
    for (const type of RESIDENT_TYPES) {
      for (const lane of Object.keys(WALKER_LANES) as WalkerLane[]) {
        const height = CHARACTER_MANIFEST.residents[type].heightMetres;
        const ratio = walkerPlacement(lane, height, TRAVELER_HEIGHT).scale * height / TRAVELER_HEIGHT;
        expect(ratio, `${type} ${lane}`).toBeGreaterThanOrEqual(0.8);
        expect(ratio, `${type} ${lane}`).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it("keeps both lanes on his pavement, one behind him and one in front", () => {
    const behind = walkerPlacement("behind", 1.68, TRAVELER_HEIGHT);
    const front = walkerPlacement("front", 1.68, TRAVELER_HEIGHT);
    expect(behind.footY).toBeGreaterThan(0);
    expect(behind.z).toBeLessThan(0);
    expect(front.footY).toBeLessThan(0);
    expect(front.z).toBeGreaterThan(0);
    // Feet within a fifth of a metre of his: on the pavement, never up on a wall or railing.
    expect(Math.abs(behind.footY)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(front.footY)).toBeLessThanOrEqual(0.2);
  });
});

describe("a walker on the street", () => {
  const pass = (direction: 1 | -1, speed: number, lane: WalkerLane = "behind"): WalkerPass => ({
    id: "0:0", startSecond: 10, slot: 0, lane, direction, speedMetresPerSecond: speed,
  });
  const placement = walkerPlacement("behind", 1.68, TRAVELER_HEIGHT);
  const edge = DESKTOP_WIDTH_METRES / 2 + WALKER_EDGE_MARGIN_METRES;
  const advance = (walker: StreetWalker, dt: number, groundSpeed: number, standing = false) =>
    advanceWalker(walker, dt, placement, 1.68, TRAVELER_HEIGHT, groundSpeed, standing);

  it("walks in from the right facing left, or from the left facing right", () => {
    const towards = enterWalker(pass(-1, 1.3), placement, 500, METRES_PER_SECOND, DESKTOP_WIDTH_METRES)!;
    expect(towards.direction).toBe(-1);
    expect(walkerScreenX(towards, 500)).toBeCloseTo(edge);
    const overtaking = enterWalker(pass(1, 1.9), placement, 500, METRES_PER_SECOND, DESKTOP_WIDTH_METRES)!;
    expect(overtaking.direction).toBe(1);
    expect(walkerScreenX(overtaking, 500)).toBeCloseTo(-edge);
    for (const walker of [towards, overtaking]) expect(walkerHasLeft(walker, 500, DESKTOP_WIDTH_METRES)).toBe(false);
  });

  it("comes towards him from the right instead when he walks too fast to be overtaken", () => {
    const atTwicePace = enterWalker(pass(1, 1.9), placement, 500, 2 * METRES_PER_SECOND, DESKTOP_WIDTH_METRES)!;
    expect(atTwicePace.direction).toBe(-1);
    expect(walkerScreenX(atTwicePace, 500)).toBeCloseTo(edge);
  });

  it("never enters facing one way while the pavement carries it the other", () => {
    for (let groundSpeed = 0; groundSpeed <= 7; groundSpeed += 0.05) {
      for (const candidate of [pass(-1, 1.2), pass(-1, 1.36), pass(1, 1.8), pass(1, 1.96)]) {
        const walker = enterWalker(candidate, placement, 0, groundSpeed, DESKTOP_WIDTH_METRES)!;
        const across = walkerScreenSpeed(walker.direction, walker.speedMetresPerSecond, placement, groundSpeed);
        expect(walker.direction * across).toBeGreaterThanOrEqual(WALKER_MIN_SCREEN_SPEED);
        // In from the side behind the way they face.
        expect(Math.sign(walkerScreenX(walker, 0))).toBe(-walker.direction);
      }
    }
    expect(enterWalker(pass(1, 1.9), placement, 0, Number.NaN, DESKTOP_WIDTH_METRES)).toBeNull();
  });

  it("steps in time with the ground it covers, and stands still when standing", () => {
    const walker: StreetWalker = { streetMetres: 0, direction: -1, speedMetresPerSecond: 1.3, gaitSeconds: 0 };
    const moved = advance(walker, 0.5, METRES_PER_SECOND);
    expect(moved.streetMetres).toBeCloseTo(-1.3 * 0.5 * placement.scale);
    expect(moved.gaitSeconds).toBeCloseTo((1.3 * 0.5) / (METRES_PER_SECOND * 1.68 / TRAVELER_HEIGHT));
    expect(advance(walker, 0.5, METRES_PER_SECOND, true)).toBe(walker);
    let cycling = walker;
    for (let frame = 0; frame < 600; frame += 1) cycling = advance(cycling, 1 / 60, METRES_PER_SECOND);
    expect(cycling.gaitSeconds).toBeGreaterThanOrEqual(0);
    expect(cycling.gaitSeconds).toBeLessThan(GAIT_CYCLE_SECONDS);
  });

  it("turns round rather than drift backwards once he outpaces it, and never turns back", () => {
    const overtaking: StreetWalker = { streetMetres: 0, direction: 1, speedMetresPerSecond: 1.9, gaitSeconds: 0 };
    expect(advance(overtaking, 0.1, METRES_PER_SECOND).direction).toBe(1);
    expect(advance(overtaking, 0.1, 0).direction).toBe(1);
    const outpaced = advance(overtaking, 0.1, 2 * METRES_PER_SECOND);
    expect(outpaced.direction).toBe(-1);
    expect(outpaced.streetMetres).toBeLessThan(0);
    for (let groundSpeed = 0; groundSpeed <= 7; groundSpeed += 0.25) {
      expect(advance(outpaced, 0.1, groundSpeed).direction).toBe(-1);
    }
  });

  it("is removed only once it is beyond the edge", () => {
    const at = (x: number): StreetWalker => ({ streetMetres: 100 + x, direction: 1, speedMetresPerSecond: 1, gaitSeconds: 0 });
    expect(walkerHasLeft(at(0), 100, DESKTOP_WIDTH_METRES)).toBe(false);
    expect(walkerHasLeft(at(-edge), 100, DESKTOP_WIDTH_METRES)).toBe(false);
    expect(walkerHasLeft(at(edge + 0.3), 100, DESKTOP_WIDTH_METRES)).toBe(true);
    expect(walkerHasLeft(at(-edge - 0.3), 100, DESKTOP_WIDTH_METRES)).toBe(true);
    expect(walkerHasLeft(at(0), Number.NaN, DESKTOP_WIDTH_METRES)).toBe(true);
  });
});

describe("people passing him over a long watch", () => {
  type Simulated = {
    street: StreetWalker; placement: WalkerPlacement; lane: WalkerLane; height: number; inView: number; previousX: number;
  };

  /**
   * Plays the stage's own rules at 60 frames a second for 40 minutes: his pace minute
   * by minute from `paces`, his regular stops for an action (distance held, nobody new
   * sets off) and two minutes of waiting for the internet (the watched clock stands still).
   */
  function watch(paces: readonly number[]) {
    const frame = 1 / 60;
    const events = {
      entries: [] as number[], exits: [] as number[], sides: new Set<string>(), longestInView: 0, backwards: 0, turns: 0,
    };
    let raw = 0;
    let distance = 0;
    let walkers: Simulated[] = [];
    for (let wall = 0; wall < 2400; wall += frame) {
      const waiting = wall >= 1500 && wall < 1620;
      const acting = !waiting && wall % 97 < 5;
      const previousRaw = raw;
      const previousDistance = distance;
      if (!waiting) raw += frame;
      if (!waiting && !acting) distance += METRES_PER_SECOND * paces[Math.floor(wall / 60) % paces.length]! * frame;
      const groundSpeed = (distance - previousDistance) / frame;
      const passes = waiting || acting ? [] : walkerPassesBetween(previousRaw, raw, 13, SEED, 2);
      for (const pass of passes) {
        if (walkers.length >= 2 || walkers.some((walker) => walker.lane === pass.lane)) continue;
        const height = residentHeight(pass.slot);
        const placement = walkerPlacement(pass.lane, height, TRAVELER_HEIGHT);
        const street = enterWalker(pass, placement, distance, groundSpeed, DESKTOP_WIDTH_METRES);
        if (!street) continue;
        const x = walkerScreenX(street, distance);
        events.entries.push(x);
        events.sides.add(x > 0 ? "right" : "left");
        walkers.push({ street, placement, lane: pass.lane, height, inView: 0, previousX: x });
      }
      walkers = walkers.filter((walker) => {
        const facing = walker.street.direction;
        walker.street = advanceWalker(
          walker.street, frame, walker.placement, walker.height, TRAVELER_HEIGHT, groundSpeed,
        );
        if (walker.street.direction !== facing) events.turns += 1;
        const x = walkerScreenX(walker.street, distance);
        // Moving across the screen against the way they face is the bug this guards.
        if ((x - walker.previousX) * walker.street.direction < 0) events.backwards += 1;
        walker.previousX = x;
        if (Math.abs(x) < DESKTOP_WIDTH_METRES / 2 + BODY_HALF_WIDTH_METRES) walker.inView += frame;
        if (!walkerHasLeft(walker.street, distance, DESKTOP_WIDTH_METRES)) return true;
        events.exits.push(x);
        events.longestInView = Math.max(events.longestInView, walker.inView);
        return false;
      });
    }
    return events;
  }

  const outOfView = DESKTOP_WIDTH_METRES / 2 + BODY_HALF_WIDTH_METRES;
  const changingPace = watch([1, 1, 2, 1, 5, 1, 2.58, 1, 3, 1]);
  const oneWatcher = watch([1]);

  it("never lets anyone appear or disappear in view, through pace changes, stops and waiting", () => {
    for (const events of [changingPace, oneWatcher]) {
      expect(events.entries.length).toBeGreaterThanOrEqual(20);
      for (const x of [...events.entries, ...events.exits]) expect(Math.abs(x)).toBeGreaterThan(outOfView);
      expect(events.exits.length).toBeGreaterThanOrEqual(events.entries.length - 2);
    }
  });

  it("never shows anyone walking one way while moving the other", () => {
    for (const events of [changingPace, oneWatcher]) expect(events.backwards).toBe(0);
    // At one watcher's steady pace nobody who overtakes him is ever outpaced.
    expect(oneWatcher.turns).toBe(0);
  });

  it("brings people in from both sides at one watcher's pace", () => {
    expect([...oneWatcher.sides].sort()).toEqual(["left", "right"]);
  });

  it("keeps each person passing rather than lingering beside him", () => {
    for (const events of [changingPace, oneWatcher]) {
      expect(events.longestInView).toBeGreaterThan(1);
      expect(events.longestInView).toBeLessThan(60);
    }
  });
});
