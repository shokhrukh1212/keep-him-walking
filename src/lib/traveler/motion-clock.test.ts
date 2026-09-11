import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import {
  ACTION_DURATIONS,
  METRES_PER_SECOND,
  METRES_PER_STEP,
  STEP_DURATION_SECONDS,
  travelerMotionAt,
  systemActionAt,
  visibleStepsBetween,
} from "./motion-clock";

describe("traveler motion clock", () => {
  it("counts one step per 600ms plant and travels 750mm per plant", () => {
    // Start after the short arrival action so this interval is uninterrupted.
    const start = 20;
    const before = travelerMotionAt(tashkentCountryPackV4, start);
    const after = travelerMotionAt(tashkentCountryPackV4, start + 12);
    expect(after.plantIndex - before.plantIndex).toBe(20);
    expect(after.distanceMetres - before.distanceMetres).toBeCloseTo(20 * METRES_PER_STEP, 5);
    expect(visibleStepsBetween(tashkentCountryPackV4, start, start + 12)).toBe(20);
  });

  it("schedules route beats by metres on the planted-foot grid", () => {
    const arrivalMetres = tashkentCountryPackV4.storyBeats
      .find((beat) => beat.kind === "arrival")!.atMetres!;
    const arrivalAt = Math.round(arrivalMetres / METRES_PER_STEP) * STEP_DURATION_SECONDS;
    const before = travelerMotionAt(tashkentCountryPackV4, arrivalAt);
    const during = travelerMotionAt(tashkentCountryPackV4, arrivalAt + ACTION_DURATIONS.wave - 0.01);
    expect(during.action?.kind).toBe("wave");
    expect(during.routeSeconds).toBeGreaterThan(before.routeSeconds);
    expect(during.plantIndex-before.plantIndex).toBeLessThanOrEqual(2);
    expect(during.distanceMetres).toBeGreaterThan(before.distanceMetres);
  });

  it("uses exact bounded action durations and resumes walking immediately", () => {
    const landmarkMetres = tashkentCountryPackV4.storyBeats
      .find((beat) => beat.kind === "landmark")!.atMetres!;
    const raw = Math.round(landmarkMetres / METRES_PER_STEP) * STEP_DURATION_SECONDS;
    const start = travelerMotionAt(tashkentCountryPackV4, raw, landmarkMetres);
    expect(start.action?.kind).toBe("photo");
    expect(start.action?.durationSeconds).toBe(ACTION_DURATIONS.photo);
    const resumed = travelerMotionAt(
      tashkentCountryPackV4,
      raw + ACTION_DURATIONS.photo + 0.05,
      landmarkMetres + (ACTION_DURATIONS.photo + 0.05) * METRES_PER_SECOND,
    );
    expect(resumed.action).toBeNull();
    expect(resumed.locomotionSeconds).toBeGreaterThan(start.locomotionSeconds);
  });

  it("always returns one of the six approved gait poses", () => {
    for (let sample = 0; sample < 120; sample += 1) {
      expect(travelerMotionAt(tashkentCountryPackV4, 20 + sample / 20).gaitFrameIndex)
        .toBeGreaterThanOrEqual(0);
      expect(travelerMotionAt(tashkentCountryPackV4, 20 + sample / 20).gaitFrameIndex)
        .toBeLessThan(6);
    }
  });
});

describe("deterministic system actions", () => {
  it("chooses one daily stumble and cheers at the marathon", () => {
    let stumble: ReturnType<typeof systemActionAt> = null;
    for (let metres = 2_000; metres < 6_000 && !stumble; metres += .25) {
      const action = systemActionAt(tashkentCountryPackV4, 10_000, metres);
      if (action?.kind === "stumble") stumble = action;
    }
    expect(stumble).toMatchObject({ kind: "stumble", source: "system" });
    expect(systemActionAt(tashkentCountryPackV4, 40_000, tashkentCountryPackV4.marathonMetres + 1))
      .toMatchObject({ kind: "cheer", source: "system" });
  });

  it("is identical for repeated inputs", () => {
    for (let seconds = 0; seconds < 2_000; seconds += 13) {
      expect(systemActionAt(tashkentCountryPackV4, seconds, 3_000))
        .toEqual(systemActionAt(tashkentCountryPackV4, seconds, 3_000));
    }
  });

  it("selects look-up moments from the authored zone kind, never words in its id", () => {
    const lanesPack = {
      ...tashkentCountryPackV4,
      route: {
        ...tashkentCountryPackV4.route,
        zones: tashkentCountryPackV4.route.zones.map((zone, index) => index === 1
          ? { ...zone, id: "quiet-street", kind: "lanes" as const }
          : zone),
      },
    };
    const misleadingPack = {
      ...lanesPack,
      route: {
        ...lanesPack.route,
        zones: lanesPack.route.zones.map((zone, index) => index === 1
          ? { ...zone, id: "looks-like-landmark", kind: "arrival" as const }
          : zone),
      },
    };
    const metresInSecondZone = lanesPack.route.zones[0]!.lengthMetres + 100;
    let lookSecond: number | null = null;
    for (let seconds = 0; seconds < 540 && lookSecond === null; seconds += 0.25) {
      if (systemActionAt(lanesPack, seconds, metresInSecondZone)?.kind === "look_up") {
        lookSecond = seconds;
      }
    }
    expect(lookSecond).not.toBeNull();
    expect(systemActionAt(misleadingPack, lookSecond!, metresInSecondZone)?.kind).not.toBe("look_up");
  });
});

describe("crowd-scheduled actions", () => {
  const pack = tashkentCountryPackV4;
  // Far past the last route beat (7,900 m), so the route timeline is quiet.
  const quietDistance = 9_000;
  const quietRaw = quietDistance / METRES_PER_SECOND;

  it("plays a scheduled wave on the plant grid for the full duration", () => {
    const at = Math.round(quietRaw);
    const during = travelerMotionAt(pack, at + 1, quietDistance + METRES_PER_SECOND, [
      { kind: "wave", atActiveSecond: at },
    ]);
    expect(during.action?.kind).toBe("wave");
    expect(during.action?.source).toBe("crowd");
    expect(during.action?.durationSeconds).toBe(ACTION_DURATIONS.wave);
  });

  it("does not play before the scheduled second or after it elapses", () => {
    const at = Math.round(quietRaw) + 10;
    const before = travelerMotionAt(pack, at - 1, quietDistance, [
      { kind: "wave", atActiveSecond: at },
    ]);
    expect(before.action).toBeNull();

    const after = travelerMotionAt(
      pack,
      at + ACTION_DURATIONS.wave + 1,
      quietDistance + (ACTION_DURATIONS.wave + 1) * METRES_PER_SECOND,
      [{ kind: "wave", atActiveSecond: at }],
    );
    expect(after.action).toBeNull();
  });

  it("aligns the scheduled second onto the 0.6 s planted-foot grid", () => {
    // A whole second is not a plant boundary: 100 s snaps forward to 100.2 s,
    // which is the 167th footfall. Everyone therefore starts on the same foot.
    const snapshot = travelerMotionAt(pack, 100.5, quietDistance, [
      { kind: "wave", atActiveSecond: 100 },
    ]);
    expect(snapshot.action?.kind).toBe("wave");
    expect(snapshot.action?.elapsedSeconds).toBeCloseTo(0.3, 5);
    expect(snapshot.action?.elapsedSeconds).not.toBeCloseTo(0.5, 5);
  });

  it("holds the world while he performs and releases it afterwards", () => {
    const at = Math.round(quietRaw);
    const mid = travelerMotionAt(pack, at + 1.5, quietDistance + 1.5 * METRES_PER_SECOND, [
      { kind: "drink", atActiveSecond: at },
    ]);
    expect(mid.action?.kind).toBe("drink");
    expect(mid.speedFactor).toBe(0);

    const done = travelerMotionAt(pack, at + 20, quietDistance + 20 * METRES_PER_SECOND, [
      { kind: "drink", atActiveSecond: at },
    ]);
    expect(done.action).toBeNull();
    expect(done.speedFactor).toBe(1);
  });

  it("never interrupts an encounter and resumes once the goodbye ends", () => {
    // The encounter beat sits at 1,900 m.
    const encounterMetres = 1_900;
    const insideDistance = encounterMetres + 5 * METRES_PER_SECOND;
    const insideRaw = 2_000;
    const scheduled = [{ kind: "wave" as const, atActiveSecond: insideRaw }];

    const during = travelerMotionAt(pack, insideRaw + 1, insideDistance, scheduled);
    expect(during.action?.kind).toBe("encounter");
    expect(during.action?.source).toBe("route");

    // Once distance carries him past the encounter, the deferred wave starts
    // from the beginning rather than being dropped.
    const encounterDuration = during.action!.durationSeconds;
    const afterDistance = encounterMetres + (encounterDuration + 0.5) * METRES_PER_SECOND;
    const after = travelerMotionAt(pack, insideRaw + 400, afterDistance, scheduled);
    expect(after.action?.kind).toBe("wave");
    expect(after.action?.source).toBe("crowd");
    // Measured from the end of the goodbye, not from the scheduled second 400 s
    // earlier — otherwise the wave would have been silently dropped.
    expect(after.action?.elapsedSeconds).toBeGreaterThanOrEqual(0);
    expect(after.action?.elapsedSeconds).toBeLessThan(1);
  });

  it("leaves the locomotion clock and step counts untouched", () => {
    const at = Math.round(quietRaw);
    const withoutCrowd = travelerMotionAt(pack, at + 1, quietDistance + METRES_PER_SECOND);
    const withCrowd = travelerMotionAt(pack, at + 1, quietDistance + METRES_PER_SECOND, [
      { kind: "photo", atActiveSecond: at },
    ]);
    expect(withCrowd.plantIndex).toBe(withoutCrowd.plantIndex);
    expect(withCrowd.locomotionSeconds).toBe(withoutCrowd.locomotionSeconds);
    expect(withCrowd.action?.kind).toBe("photo");
    expect(withoutCrowd.action).toBeNull();
  });

  it("computes the identical frame for two clients with the same inputs", () => {
    const at = Math.round(quietRaw);
    const scheduled = [
      { kind: "photo" as const, atActiveSecond: at },
      { kind: "wave" as const, atActiveSecond: at + 200 },
    ];
    // The second client receives the same rows in a different order, as an
    // out-of-order response or a differently sorted bundle would deliver them.
    const reversed = [...scheduled].reverse();
    for (let offset = 0; offset <= 12; offset += 0.25) {
      const raw = at + offset;
      const distance = quietDistance + offset * METRES_PER_SECOND;
      expect(travelerMotionAt(pack, raw, distance, scheduled))
        .toEqual(travelerMotionAt(pack, raw, distance, reversed));
    }
  });

  it("ignores malformed rows rather than inventing an action", () => {
    const at = Math.round(quietRaw);
    const snapshot = travelerMotionAt(pack, at + 1, quietDistance + METRES_PER_SECOND, [
      { kind: "wave", atActiveSecond: Number.NaN },
    ]);
    expect(snapshot.action).toBeNull();
  });
});
