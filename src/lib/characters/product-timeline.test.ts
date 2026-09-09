import { describe, expect, it } from "vitest";
import { almatyCountryPackV1 } from "@/content/countries/almaty.v1";
import type { TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
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
  it("uses the GLB walk while traveling and a stable idle when the journey stops", () => {
    expect(productCharacterSceneAt(almatyCountryPackV1, baseMotion, true, undefined, 0).traveler.clip).toBe("walk");
    expect(productCharacterSceneAt(almatyCountryPackV1, baseMotion, false, undefined, 0).traveler.clip).toBe("idle");
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
