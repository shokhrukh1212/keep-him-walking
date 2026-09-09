import { describe, expect, it } from "vitest";
import { almatyCountryPackV1 } from "@/content/countries/almaty.v1";
import type { TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { productCharacterSceneAt, walkingViewportOffset } from "./product-timeline";

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

  it("moves a walking actor around the camera-follow anchor without leaving the stage", () => {
    expect(walkingViewportOffset(0)).toBeCloseTo(0);
    expect(walkingViewportOffset(2)).toBeCloseTo(.032);
    expect(walkingViewportOffset(4)).toBeCloseTo(0);
    expect(walkingViewportOffset(6)).toBeCloseTo(-.032);
    expect(productCharacterSceneAt(
      almatyCountryPackV1, { ...baseMotion, locomotionSeconds: 2 }, false, undefined, 0,
    ).travelerViewportOffset).toBeUndefined();
  });

  it("cycles extended waiting clips before sitting after ten minutes", () => {
    expect(productCharacterSceneAt(
      almatyCountryPackV1, baseMotion, false, undefined, 0, 1, 2,
    ).traveler.clip).toBe("wait_pockets");
    expect(productCharacterSceneAt(
      almatyCountryPackV1, baseMotion, false, undefined, 0, 1, 6,
    ).traveler.clip).toBe("look_up");
    expect(productCharacterSceneAt(
      almatyCountryPackV1, baseMotion, false, undefined, 0, 1, 10,
    ).traveler.clip).toBe("wait_pockets");
    expect(productCharacterSceneAt(
      almatyCountryPackV1, baseMotion, false, undefined, 0, 1, 600,
    ).traveler.clip).toBe("sit_down");
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
