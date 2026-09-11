import { describe, expect, it } from "vitest";
import { almatyCountryPackV1 } from "@/content/countries/almaty.v1";
import type { TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { CLIP_DURATIONS } from "./manifest";
import { productCharacterSceneAt } from "./product-timeline";

const baseMotion: TravelerMotionSnapshot = {
  rawActiveSeconds: 12,
  locomotionSeconds: 12,
  routeSeconds: 12,
  distanceMetres: 15,
  plantIndex: 20,
  plantedFoot: "left",
  cyclePhase: 0,
  stepPhase: 0,
  gaitFrameIndex: 0,
  speedFactor: 1,
  action: null,
};

describe("product character timeline", () => {
  it("uses the GLB walk while traveling and a deterministic wait take when stopped", () => {
    expect(productCharacterSceneAt(almatyCountryPackV1, baseMotion, true, undefined, 0).traveler.clip).toBe("walk");
    expect(productCharacterSceneAt(almatyCountryPackV1, baseMotion, false, undefined, 0).traveler.clip).toBe("wait_pockets");
  });

  it("renders the explicit start, stop and resume phases after the sprite renderer is gone", () => {
    const scene = (state: "start_walk" | "slow_walk" | "stop" | "resume_walk", seconds: number) =>
      productCharacterSceneAt(
        almatyCountryPackV1,
        baseMotion,
        state === "start_walk" || state === "resume_walk",
        undefined,
        0,
        1,
        0,
        12,
        false,
        undefined,
        state,
        seconds,
      ).traveler;

    expect(scene("start_walk", .3).clip).toBe("walk_start");
    expect(scene("slow_walk", .3).clip).toBe("stop");
    expect(scene("stop", .8).clip).toBe("walk_stop");
    expect(scene("resume_walk", .3).clip).toBe("resume");
    expect(scene("resume_walk", .3).seconds).toBeGreaterThan(0);
  });

  it("keeps a walking actor on the authored route anchor", () => {
    const first = productCharacterSceneAt(
      almatyCountryPackV1, { ...baseMotion, locomotionSeconds: 2 }, true, undefined, 0,
    );
    const later = productCharacterSceneAt(
      almatyCountryPackV1, { ...baseMotion, locomotionSeconds: 7 }, true, undefined, 0,
    );
    expect(first).not.toHaveProperty("travelerViewportOffset");
    expect(later).not.toHaveProperty("travelerViewportOffset");
  });

  it("cycles extended waiting clips before sitting after ten minutes", () => {
    const waiting = (waited: number) => productCharacterSceneAt(
      almatyCountryPackV1, baseMotion, false, undefined, 0, 1, waited,
    ).traveler.clip;
    expect(waiting(2)).toBe("wait_pockets");
    expect(waiting(CLIP_DURATIONS.wait_pockets + 1)).toBe("look_up");
    expect(waiting(CLIP_DURATIONS.wait_pockets + CLIP_DURATIONS.look_up + 1)).toBe("wait_pockets");
    expect(waiting(600)).toBe("sit_down");
  });

  it("stands a seated traveler up on arrival but only looks up when he was still standing", () => {
    const wake = (waited: number, elapsed: number) => productCharacterSceneAt(
      almatyCountryPackV1, baseMotion, false, undefined, 0, 1, waited, 12, false, elapsed,
    ).traveler;
    expect(wake(120, .4).clip).toBe("look_up");
    expect(wake(120, 2).clip).toBe("look_up");
    expect(wake(900, .4).clip).toBe("sitting");
    expect(wake(900, 2).clip).toBe("stand_up");
    expect(wake(900, 2).seconds).toBeCloseTo(1.2);
  });

  it("uses a brisk planted-foot sample and two-degree lean from pace three", () => {
    const ordinary = productCharacterSceneAt(
      almatyCountryPackV1,
      { ...baseMotion, locomotionSeconds: 12.3, stepPhase: 0.5 },
      true,
      undefined,
      0,
      2,
    );
    const brisk = productCharacterSceneAt(
      almatyCountryPackV1,
      { ...baseMotion, locomotionSeconds: 12.3, stepPhase: 0.5 },
      true,
      undefined,
      0,
      3,
    );

    expect(ordinary.traveler.timeScale).toBe(1);
    expect(brisk.traveler.timeScale).toBe(1.25);
    expect(brisk.traveler.seconds).toBeCloseTo(0.375, 5);
    expect(brisk.travelerLeanRadians).toBeCloseTo(2 * Math.PI / 180, 8);

    const atPlant = productCharacterSceneAt(
      almatyCountryPackV1,
      { ...baseMotion, locomotionSeconds: 12.6, plantIndex: 21, plantedFoot: "right" },
      true,
      undefined,
      0,
      3,
    );
    expect(atPlant.traveler.seconds).toBeCloseTo(0.6, 5);
  });

  it("plays a full prop animation between the stop and resume transitions", () => {
    const motion = {
      ...baseMotion,
      action: {
        kind: "drink" as const,
        state: "drink" as const,
        source: "route" as const,
        label: "Taking a short drink",
        elapsedSeconds: 2.75,
        durationSeconds: 5.5,
        progress: 0.5,
      },
    };
    const scene = productCharacterSceneAt(almatyCountryPackV1, motion, true, undefined, 0);
    expect(scene.traveler.clip).toBe("drink");
    expect(scene.traveler.seconds).toBeGreaterThan(2);
    expect(scene.showResident).toBe(false);
  });

  it("keeps traveler and resident dialogue roles complementary", () => {
    const motion = {
      ...baseMotion,
      action: {
        kind: "encounter" as const,
        state: "talk" as const,
        source: "route" as const,
        label: "Talking",
        elapsedSeconds: 5.5,
        durationSeconds: 30,
        progress: 0.2,
        encounterPhase: "talk" as const,
        dialogueLineIndex: 0,
      },
    };
    const scene = productCharacterSceneAt(almatyCountryPackV1, motion, true, undefined, 0);
    expect(scene.showResident).toBe(true);
    expect([scene.traveler.clip, scene.resident.clip].sort()).toEqual(["listen", "talk"]);
  });
});
