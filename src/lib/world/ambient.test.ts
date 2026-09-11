import { describe, expect, it } from "vitest";
import {
  birdFlights, buntingVisible, steamPuffs, tramPass,
  walkerPopulation, wavingWalker, windowLightAlpha,
} from "./ambient";

describe("birdFlights", () => {
  it("draws nothing when the tier allows no birds", () => {
    expect(birdFlights(120, "tashkent-v4", 0)).toEqual([]);
  });

  it("keeps every bird it draws on screen", () => {
    for (let second = 0; second < 600; second += 1) {
      for (const bird of birdFlights(second, "tashkent-v4", 4)) {
        expect(bird.progress).toBeGreaterThanOrEqual(0);
        expect(bird.progress).toBeLessThanOrEqual(1);
        expect(bird.height).toBeGreaterThan(0);
        expect(bird.height).toBeLessThan(0.5);
      }
    }
  });

  it("never exceeds the tier limit", () => {
    for (let second = 0; second < 600; second += 1) {
      expect(birdFlights(second, "tashkent-v4", 2).length).toBeLessThanOrEqual(2);
    }
  });

  it("lets the sky go empty between flights", () => {
    let emptySeconds = 0;
    for (let second = 0; second < 600; second += 1) {
      if (birdFlights(second, "tashkent-v4", 4).length === 0) emptySeconds += 1;
    }
    expect(emptySeconds).toBeGreaterThan(300);
  });

  it("sends them across faster in wind", () => {
    const seed = "tashkent-v4";
    const calm = new Set<number>();
    const windy = new Set<number>();
    for (let second = 0; second < 600; second += 1) {
      if (birdFlights(second, seed, 4, 1).length > 0) calm.add(second);
      if (birdFlights(second, seed, 4, 1.8).length > 0) windy.add(second);
    }
    expect(windy.size).toBeLessThan(calm.size);
  });

  it("is identical for two viewers at the same second", () => {
    expect(birdFlights(311, "dushanbe-v1", 4, 1.2)).toEqual(birdFlights(311, "dushanbe-v1", 4, 1.2));
  });

  it("gives two cities different skies over the same minutes", () => {
    const sky = (seed: string) => Array.from({ length: 400 }, (_unused, second) => birdFlights(second, seed, 4).length).join("");
    expect(sky("dushanbe-v1")).not.toBe(sky("tbilisi-v1"));
  });
});

describe("walkerPopulation", () => {
  it("empties the street at night and when the scene opts out", () => {
    expect(walkerPopulation(10, 2, "london-v1", 2)).toBe(0);
    expect(walkerPopulation(10, 12, "london-v1", 2, false)).toBe(0);
  });

  it("shows supporting people briefly, with long empty stretches", () => {
    let visible = 0;
    let longestEmpty = 0;
    let empty = 0;
    for (let second = 0; second < 600; second += 1) {
      const count = walkerPopulation(second, 13, "london-v1", 2);
      if (count > 0) {
        visible += 1;
        empty = 0;
      } else {
        empty += 1;
        longestEmpty = Math.max(longestEmpty, empty);
      }
    }
    expect(visible).toBeGreaterThanOrEqual(60);
    expect(visible).toBeLessThanOrEqual(90);
    expect(longestEmpty).toBeGreaterThanOrEqual(80);
  });

  it("never exceeds two or the tier ceiling and is deterministic", () => {
    for (let second = 0; second < 600; second += 1) {
      expect(walkerPopulation(second, 13, "london-v1", 8)).toBeLessThanOrEqual(2);
      expect(walkerPopulation(second, 13, "london-v1", 1)).toBeLessThanOrEqual(1);
      expect(walkerPopulation(second, 13, "london-v1", 0)).toBe(0);
    }
    expect(walkerPopulation(137, 13, "london-v1", 2))
      .toBe(walkerPopulation(137, 13, "london-v1", 2));
  });
});

describe("steamPuffs", () => {
  it("keeps every puff inside one rising cycle", () => {
    for (let second = 0; second < 200; second += 1) {
      for (const puff of steamPuffs(second)) {
        expect(puff.progress).toBeGreaterThanOrEqual(0);
        expect(puff.progress).toBeLessThan(1);
      }
    }
  });

  it("spaces the puffs so they do not rise as one", () => {
    const [first, second, third] = steamPuffs(0);
    expect(first!.progress).not.toBe(second!.progress);
    expect(second!.progress).not.toBe(third!.progress);
  });
});

describe("tramPass", () => {
  it("passes once per cycle and is gone the rest of the time", () => {
    let active = 0;
    for (let second = 0; second < 150; second += 1) {
      if (tramPass(second, "tashkent-v4").active) active += 1;
    }
    expect(active).toBe(7);
  });

  it("crosses the full screen while it is active", () => {
    const seen: number[] = [];
    for (let second = 0; second < 150; second += 1) {
      const tram = tramPass(second, "tashkent-v4");
      if (tram.active) seen.push(tram.progress);
    }
    expect(Math.min(...seen)).toBeLessThan(0.2);
    expect(Math.max(...seen)).toBeGreaterThan(0.8);
  });
});

describe("buntingVisible", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("stays down until the server confirms the moment", () => {
    expect(buntingVisible(null, now)).toBe(false);
    expect(buntingVisible(undefined, now)).toBe(false);
  });

  it("goes up once the confirmed moment has passed", () => {
    expect(buntingVisible("2026-09-10T11:00:00.000Z", now)).toBe(true);
  });

  it("does not go up early for a moment still in the future", () => {
    expect(buntingVisible("2026-09-10T13:00:00.000Z", now)).toBe(false);
  });

  it("ignores a timestamp it cannot read", () => {
    expect(buntingVisible("not a time", now)).toBe(false);
  });
});

describe("windowLightAlpha", () => {
  it("is dark at noon and lit at midnight", () => {
    expect(windowLightAlpha(12)).toBe(0);
    expect(windowLightAlpha(0)).toBe(1);
  });

  it("ramps across dusk rather than snapping on", () => {
    expect(windowLightAlpha(20)).toBeGreaterThan(0);
    expect(windowLightAlpha(20)).toBeLessThan(1);
  });
});

describe("wavingWalker", () => {
  it("picks nobody when nobody is there", () => {
    expect(wavingWalker(100, "tashkent-v4", 0)).toBe(-1);
  });

  it("picks a walker that exists", () => {
    for (let second = 0; second < 200; second += 1) {
      const index = wavingWalker(second, "tashkent-v4", 3);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(3);
    }
  });

  it("picks the same walker for every viewer at that second", () => {
    expect(wavingWalker(77, "tashkent-v4", 3)).toBe(wavingWalker(77, "tashkent-v4", 3));
  });
});
