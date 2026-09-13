import { describe, expect, it } from "vitest";
import { CHARACTER_MANIFEST, RESIDENT_TYPES, type ResidentType } from "@/lib/characters/manifest";
import { GAIT_CYCLE_SECONDS, METRES_PER_SECOND } from "@/lib/traveler/pace";
import {
  WALKER_EDGE_MARGIN_METRES, WALKER_LANE, WALKER_MAX_CATCH_UP_SECONDS, WALKER_MIN_GAP_METRES, WALKER_SPEEDS,
  advanceWalker, enterWalker, walkerCanFollow, walkerHasLeft, walkerMustWait, walkerPassesBetween,
  walkerPlacement, walkerScreenSpeed, walkerSpeedMetresPerSecond, walkerTakeMetresPerSecond,
  type StreetWalker, type WalkerPass, type WalkerPlacement,
} from "./walkers";

const SEED = "london-v1";
const TRAVELER_HEIGHT = CHARACTER_MANIFEST.traveler.heightMetres;
/** 1440 × 900: he is 30 % of the height, 270 px, so the screen shows 9.49 m of street. */
const DESKTOP_WIDTH_METRES = (1.78 * 900 / 270) * (1440 / 900);
/** Half a body with a swinging arm: a centre nearer the middle than this is at least partly in view. */
const BODY_HALF_WIDTH_METRES = 0.6;
const ENTRY = DESKTOP_WIDTH_METRES / 2 + WALKER_EDGE_MARGIN_METRES;

function passesOver(seconds: number, tierLimit: number, localHour = 13, seed = SEED, step = 1) {
  const passes: WalkerPass[] = [];
  for (let second = 0; second < seconds; second += step) {
    passes.push(...walkerPassesBetween(second, second + step, localHour, seed, tierLimit));
  }
  return passes;
}

function placementOf(type: ResidentType) {
  return walkerPlacement(CHARACTER_MANIFEST.residents[type].heightMetres, TRAVELER_HEIGHT);
}

function stroller(type: ResidentType, x: number): StreetWalker {
  return {
    ...enterWalker(walkerSpeedMetresPerSecond(type), walkerTakeMetresPerSecond(type), DESKTOP_WIDTH_METRES)!,
    x,
  };
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

  it("leads one pass per block, two to three walking minutes apart", () => {
    const leads = passesOver(3600, 2).filter((pass) => pass.slot === 0);
    expect(leads).toHaveLength(24);
    for (let index = 1; index < leads.length; index += 1) {
      const gap = leads[index]!.startSecond - leads[index - 1]!.startSecond;
      expect(gap).toBeGreaterThanOrEqual(120);
      expect(gap).toBeLessThanOrEqual(180);
    }
  });

  it("sends a second person only where the tier allows two, a few seconds later", () => {
    expect(passesOver(3600, 1).every((pass) => pass.slot === 0)).toBe(true);
    const passes = passesOver(3600, 2);
    const followers = passes.filter((pass) => pass.slot === 1);
    expect(followers.length).toBeGreaterThan(0);
    for (const follower of followers) {
      const lead = passes.find((pass) => pass.id === follower.id.replace(/:1$/, ":0"))!;
      expect(follower.startSecond - lead.startSecond).toBeGreaterThanOrEqual(5);
      expect(follower.startSecond - lead.startSecond).toBeLessThanOrEqual(10);
    }
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

describe("a slow stroll behind him", () => {
  it("walks the woman at 1.0 m/s and the man at 1.15 m/s, both slower than him", () => {
    expect(walkerSpeedMetresPerSecond("resident-a")).toBe(1);
    expect(walkerSpeedMetresPerSecond("resident-b")).toBe(1.15);
    for (const type of RESIDENT_TYPES) {
      expect(WALKER_SPEEDS[type], type).toBeLessThan(METRES_PER_SECOND);
      expect(walkerScreenSpeed(stroller(type, 0), placementOf(type)), type).toBeLessThan(METRES_PER_SECOND);
    }
  });

  it("draws both residents a little smaller than him, on the street just behind him", () => {
    for (const type of RESIDENT_TYPES) {
      const placement = placementOf(type);
      const ratio = placement.scale * CHARACTER_MANIFEST.residents[type].heightMetres / TRAVELER_HEIGHT;
      expect(ratio, type).toBeGreaterThanOrEqual(0.8);
      expect(ratio, type).toBeLessThanOrEqual(0.9);
      // Feet 0.16 m further up the street: above the moving pavement, never up on a wall.
      expect(placement.footY, type).toBeCloseTo(0.16);
      expect(placement.z, type).toBe(WALKER_LANE.z);
      expect(placement.z, type).toBeLessThan(0);
    }
  });

  it("takes nine to fifteen seconds to cross a laptop screen, longer than the pavement does", () => {
    for (const type of RESIDENT_TYPES) {
      const seconds = DESKTOP_WIDTH_METRES / walkerScreenSpeed(stroller(type, 0), placementOf(type));
      expect(seconds, type).toBeGreaterThanOrEqual(9);
      expect(seconds, type).toBeLessThanOrEqual(15);
      expect(seconds, type).toBeGreaterThan(DESKTOP_WIDTH_METRES / METRES_PER_SECOND);
    }
  });

  it("walks in from the right and moves only by its own steps", () => {
    const walker = enterWalker(1, 1.2, DESKTOP_WIDTH_METRES)!;
    expect(walker.x).toBeCloseTo(ENTRY);
    expect(walker.waiting).toBe(false);
    expect(walkerHasLeft(walker, DESKTOP_WIDTH_METRES)).toBe(false);
    const placement = placementOf("resident-a");
    const moved = advanceWalker(walker, 0.5, placement);
    expect(moved.x).toBeCloseTo(walker.x - 0.5 * placement.scale);
    expect(enterWalker(Number.NaN, 1.2, DESKTOP_WIDTH_METRES)).toBeNull();
    expect(enterWalker(1, 0, DESKTOP_WIDTH_METRES)).toBeNull();
    expect(enterWalker(0, 1.2, DESKTOP_WIDTH_METRES)).toBeNull();
  });

  it("steps exactly as far as it moves, so its feet stay planted", () => {
    for (const type of RESIDENT_TYPES) {
      const placement = placementOf(type);
      const walker = stroller(type, 3);
      const moved = advanceWalker(walker, 0.25, placement);
      const clipSeconds = moved.gaitSeconds - walker.gaitSeconds;
      const footTravel = clipSeconds * walkerTakeMetresPerSecond(type) * placement.scale;
      expect(footTravel, type).toBeCloseTo(walker.x - moved.x, 6);
    }
  });

  it("uses each resident's measured walk take", () => {
    for (const type of RESIDENT_TYPES) {
      expect(walkerTakeMetresPerSecond(type), type).toBe(CHARACTER_MANIFEST.residents[type].walkMetresPerSecond);
    }
  });

  it("wraps its gait inside the walk cycle and stands still while standing", () => {
    const placement = placementOf("resident-b");
    let walker = stroller("resident-b", 4);
    expect(advanceWalker(walker, 0.5, placement, true)).toBe(walker);
    for (let frame = 0; frame < 600; frame += 1) walker = advanceWalker(walker, 1 / 60, placement);
    expect(walker.gaitSeconds).toBeGreaterThanOrEqual(0);
    expect(walker.gaitSeconds).toBeLessThan(GAIT_CYCLE_SECONDS);
  });

  it("is removed only once it is beyond an edge", () => {
    expect(walkerHasLeft(stroller("resident-a", 0), DESKTOP_WIDTH_METRES)).toBe(false);
    expect(walkerHasLeft(stroller("resident-a", -ENTRY), DESKTOP_WIDTH_METRES)).toBe(false);
    expect(walkerHasLeft(stroller("resident-a", -ENTRY - 0.3), DESKTOP_WIDTH_METRES)).toBe(true);
    expect(walkerHasLeft(stroller("resident-a", ENTRY + 0.3), DESKTOP_WIDTH_METRES)).toBe(true);
    expect(walkerHasLeft(stroller("resident-a", Number.NaN), DESKTOP_WIDTH_METRES)).toBe(true);
  });
});

describe("two people in one lane", () => {
  const placement = placementOf("resident-a");

  it("lets someone set off only when they can never catch up", () => {
    expect(walkerCanFollow(undefined, 1.15, placement, DESKTOP_WIDTH_METRES)).toBe(true);
    // The person ahead has only just set off.
    expect(walkerCanFollow(stroller("resident-a", ENTRY - 0.5), 1, placement, DESKTOP_WIDTH_METRES)).toBe(false);
    // A slower follower only opens the gap.
    expect(walkerCanFollow(stroller("resident-b", ENTRY - 1.3), 1, placement, DESKTOP_WIDTH_METRES)).toBe(true);
    // The faster man behind the woman: fine with a head start, refused without one.
    expect(walkerCanFollow(stroller("resident-a", ENTRY - 3.5), 1.15, placement, DESKTOP_WIDTH_METRES)).toBe(true);
    expect(walkerCanFollow(stroller("resident-a", ENTRY - 1.3), 1.15, placement, DESKTOP_WIDTH_METRES)).toBe(false);
  });

  it("waits behind someone who stopped, and sets off again once the gap has reopened", () => {
    const ahead = stroller("resident-a", 0);
    expect(walkerMustWait(stroller("resident-b", WALKER_MIN_GAP_METRES + 0.1), ahead)).toBe(false);
    expect(walkerMustWait(stroller("resident-b", WALKER_MIN_GAP_METRES - 0.05), ahead)).toBe(true);
    const stopped = { ...stroller("resident-b", WALKER_MIN_GAP_METRES + 0.1), waiting: true };
    expect(walkerMustWait(stopped, ahead)).toBe(true);
    expect(walkerMustWait({ ...stopped, x: WALKER_MIN_GAP_METRES + 0.5 }, ahead)).toBe(false);
    expect(walkerMustWait(stopped, undefined)).toBe(false);
  });
});

describe("people passing him over a long watch", () => {
  type Simulated = { street: StreetWalker; placement: WalkerPlacement; type: ResidentType; inView: number; previousX: number };

  /**
   * Plays the stage's own rules at 60 frames a second for 40 minutes: his regular stops
   * (nobody new sets off), two minutes of waiting for the internet (the watched clock
   * stands still), and a crowd wave every nine minutes that stops the person in front.
   */
  function watch() {
    const frame = 1 / 60;
    const events = {
      entries: [] as number[], exits: [] as number[], inView: [] as number[], backwards: 0, closest: Number.POSITIVE_INFINITY,
    };
    let raw = 0;
    let walkers: Simulated[] = [];
    for (let wall = 0; wall < 2400; wall += frame) {
      const waiting = wall >= 1500 && wall < 1620;
      const acting = !waiting && wall % 97 < 5;
      const waving = wall % 540 < 6;
      const previousRaw = raw;
      if (!waiting) raw += frame;
      const passes = waiting || acting ? [] : walkerPassesBetween(previousRaw, raw, 13, SEED, 2);
      for (const pass of passes) {
        if (walkers.length >= RESIDENT_TYPES.length) continue;
        const present = walkers[0]?.type;
        const type = present === undefined ? RESIDENT_TYPES[pass.slot]! : present === "resident-a" ? "resident-b" : "resident-a";
        const placement = placementOf(type);
        const rearmost = walkers.reduce<Simulated | undefined>(
          (back, walker) => (back === undefined || walker.street.x > back.street.x ? walker : back),
          undefined,
        );
        if (!walkerCanFollow(rearmost?.street, walkerSpeedMetresPerSecond(type), placement, DESKTOP_WIDTH_METRES)) continue;
        const street = enterWalker(walkerSpeedMetresPerSecond(type), walkerTakeMetresPerSecond(type), DESKTOP_WIDTH_METRES)!;
        events.entries.push(street.x);
        walkers.push({ street, placement, type, inView: 0, previousX: street.x });
      }
      const remaining = new Set<Simulated>();
      let ahead: StreetWalker | undefined;
      const ordered = [...walkers].sort((left, right) => left.street.x - right.street.x);
      for (const [index, walker] of ordered.entries()) {
        const stands = waving && index === 0;
        const waits = !stands && walkerMustWait(walker.street, ahead);
        walker.street = { ...advanceWalker(walker.street, frame, walker.placement, stands || waits), waiting: waits };
        if (walker.street.x > walker.previousX + 1e-9) events.backwards += 1;
        walker.previousX = walker.street.x;
        if (ahead) events.closest = Math.min(events.closest, walker.street.x - ahead.x);
        if (Math.abs(walker.street.x) < DESKTOP_WIDTH_METRES / 2 + BODY_HALF_WIDTH_METRES) walker.inView += frame;
        if (walkerHasLeft(walker.street, DESKTOP_WIDTH_METRES)) {
          events.exits.push(walker.street.x);
          events.inView.push(walker.inView);
          continue;
        }
        ahead = walker.street;
        remaining.add(walker);
      }
      walkers = walkers.filter((walker) => remaining.has(walker));
    }
    return events;
  }

  const events = watch();
  const outOfView = DESKTOP_WIDTH_METRES / 2 + BODY_HALF_WIDTH_METRES;

  it("never lets anyone appear or disappear in view, through stops, waiting and waves", () => {
    expect(events.entries.length).toBeGreaterThanOrEqual(12);
    for (const x of [...events.entries, ...events.exits]) expect(Math.abs(x)).toBeGreaterThan(outOfView);
    expect(events.exits.length).toBeGreaterThanOrEqual(events.entries.length - 2);
  });

  it("never moves anyone backwards", () => {
    expect(events.backwards).toBe(0);
  });

  it("never lets two people come closer than the gap", () => {
    expect(events.closest).toBeGreaterThanOrEqual(WALKER_MIN_GAP_METRES - 0.05);
  });

  it("keeps each person strolling past in well under a minute", () => {
    expect(events.inView.length).toBeGreaterThan(0);
    for (const seconds of events.inView) {
      expect(seconds).toBeGreaterThan(9);
      expect(seconds).toBeLessThan(40);
    }
  });
});
