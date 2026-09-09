import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import {
  ACTION_DURATIONS,
  METRES_PER_SECOND,
  METRES_PER_STEP,
  STEP_DURATION_SECONDS,
  travelerMotionAt,
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
