import { describe, expect, it } from "vitest";
import { almatyCountryPackV1 } from "@/content/countries/almaty.v1";
import type { TravelerMotionAction, TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { actionDurationSeconds } from "@/lib/world/activities";
import { CLIP_DURATIONS } from "./manifest";
import { clipForState, productCharacterSceneAt } from "./product-timeline";

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

function withAction(action: Partial<TravelerMotionAction>): TravelerMotionSnapshot {
  return {
    ...baseMotion,
    action: {
      kind: "drink",
      state: "drink",
      source: "system",
      label: "Taking a drink",
      elapsedSeconds: 0,
      durationSeconds: actionDurationSeconds("drink"),
      progress: 0,
      atActiveSecond: 0,
      occurrenceKey: null,
      clip: "drink",
      ...action,
    },
  };
}

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

  it("steps out of the walk, then plays the whole take at its recorded speed", () => {
    const entering = productCharacterSceneAt(almatyCountryPackV1, withAction({ elapsedSeconds: 0.5 }), true, undefined, 0);
    expect(entering.traveler).toEqual({ clip: "walk_stop", seconds: 0.5 });
    const drinking = productCharacterSceneAt(almatyCountryPackV1, withAction({ elapsedSeconds: 3.2 }), true, undefined, 0);
    expect(drinking.traveler.clip).toBe("drink");
    expect(drinking.traveler.seconds).toBeCloseTo(2, 5);
    expect(drinking.showResident).toBe(false);
    const holding = productCharacterSceneAt(almatyCountryPackV1, withAction({ elapsedSeconds: 20 }), true, undefined, 0);
    expect(holding.traveler.seconds).toBeCloseTo(CLIP_DURATIONS.drink, 3);
    expect(holding.traveler.seconds).toBeLessThan(CLIP_DURATIONS.drink);
  });

  it("maps every owner-chosen action to its approved take", () => {
    expect(clipForState("stretch")).toBe("wait_stretch");
    expect(clipForState("yawn")).toBe("wait_yawn");
    const laugh = productCharacterSceneAt(
      almatyCountryPackV1,
      withAction({ kind: "laugh", state: "react", clip: "react", elapsedSeconds: 5 }),
      true, undefined, 0,
    );
    expect(laugh.traveler).toMatchObject({ clip: "react" });
    expect(laugh.traveler.seconds).toBeCloseTo(3.8, 5);
  });

  it("keeps traveler and resident dialogue roles complementary at natural speed", () => {
    const motion = withAction({
      kind: "conversation",
      state: "talk",
      conversationPhase: "talk",
      conversationPhaseSeconds: 5.5,
      dialogueLineIndex: 0,
      conversation: { scriptId: "sample", speakerName: "Aigerim", residentType: "resident-b", lines: [] },
    });
    const scene = productCharacterSceneAt(almatyCountryPackV1, motion, true, undefined, 0);
    expect(scene.showResident).toBe(true);
    expect(scene.residentType).toBe("resident-b");
    expect([scene.traveler.clip, scene.resident.clip].sort()).toEqual(["listen", "talk"]);
    expect(scene.traveler.seconds).toBeCloseTo(5.5 % CLIP_DURATIONS.talk, 5);
  });

  it("waves one speaker at a time while the other listens", () => {
    const residentGreeting = productCharacterSceneAt(
      almatyCountryPackV1,
      withAction({ kind: "greeting", state: "listen", conversationPhase: "greet_resident", conversationPhaseSeconds: 1, conversation: {
        scriptId: null, speakerName: "Aigerim", residentType: "resident-a", lines: [],
      } }),
      true, undefined, 0,
    );
    expect(residentGreeting.traveler.clip).toBe("listen");
    expect(residentGreeting.resident).toEqual({ clip: "greet", seconds: 1 });
    const travelerGreeting = productCharacterSceneAt(
      almatyCountryPackV1,
      withAction({ kind: "greeting", state: "greet", conversationPhase: "greet_traveler", conversationPhaseSeconds: 1, conversation: {
        scriptId: null, speakerName: "Aigerim", residentType: "resident-a", lines: [],
      } }),
      true, undefined, 0,
    );
    expect(travelerGreeting.traveler).toEqual({ clip: "greet", seconds: 1 });
    expect(travelerGreeting.resident.clip).toBe("listen");
  });

  it("walks the resident in and out while the traveler stays still", () => {
    const approaching = productCharacterSceneAt(
      almatyCountryPackV1,
      withAction({ kind: "conversation", state: "idle", elapsedSeconds: 2.5,
        conversationPhase: "approach", conversationPhaseSeconds: .3 }),
      true, undefined, 0,
    );
    expect(approaching.traveler.clip).toBe("idle");
    expect(approaching.resident.clip).toBe("walk");
    expect(approaching.residentOffset).toBeGreaterThan(0);
    const departing = productCharacterSceneAt(
      almatyCountryPackV1,
      withAction({ kind: "conversation", state: "idle", conversationPhase: "depart", conversationPhaseSeconds: 1.4 }),
      true, undefined, 0,
    );
    expect(departing.traveler.clip).toBe("idle");
    expect(departing.resident.clip).toBe("walk");
    expect(departing.residentOffset).toBeCloseTo(.5, 5);
  });
});
