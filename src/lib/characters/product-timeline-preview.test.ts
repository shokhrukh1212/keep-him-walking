import { describe, expect, it } from "vitest";
import { parisCountryPackV3 } from "@/content/countries/paris.v3";
import type { TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { actionDurationSeconds } from "@/lib/world/activities";
import { CLIP_DURATIONS } from "./manifest";
import { productCharacterSceneAt } from "./product-timeline";
import type { PreviewPose } from "@/lib/preview/controller";

const motion: TravelerMotionSnapshot = {
  rawActiveSeconds: 0,
  locomotionSeconds: 0,
  routeSeconds: 0,
  distanceMetres: 0,
  plantIndex: 0,
  plantedFoot: "left",
  cyclePhase: 0,
  stepPhase: 0,
  gaitFrameIndex: 0,
  speedFactor: 1,
  action: null,
};

const drinking: TravelerMotionSnapshot = {
  ...motion,
  action: {
    kind: "drink",
    state: "drink",
    source: "system",
    label: "Taking a drink",
    elapsedSeconds: 2,
    durationSeconds: actionDurationSeconds("drink"),
    progress: 0.2,
    atActiveSecond: 0,
    occurrenceKey: null,
    clip: "drink",
  },
};

const scene = (preview: PreviewPose | undefined, snapshot = motion, traveling = false) => productCharacterSceneAt(
  parisCountryPackV3, snapshot, traveling, undefined, 0, 1, 0, 12, false, undefined, "idle", 0, preview,
);

describe("prelaunch preview pose", () => {
  it("breathes in the accepted idle take on the visible preview clock", () => {
    expect(scene({ idleSeconds: 3, speaking: false, speechSeconds: 0 }).traveler).toEqual({ clip: "idle", seconds: 3 });
    expect(scene({ idleSeconds: CLIP_DURATIONS.idle + 1, speaking: false, speechSeconds: 0 }).traveler.seconds).toBeCloseTo(1);
  });

  it("talks in the existing talk take for exactly as long as the caption shows", () => {
    const talking = scene({ idleSeconds: 50, speaking: true, speechSeconds: CLIP_DURATIONS.talk + 0.5 });
    expect(talking.traveler.clip).toBe("talk");
    expect(talking.traveler.seconds).toBeCloseTo(0.5);
    expect(scene({ idleSeconds: 50, speaking: false, speechSeconds: 0 }).traveler.clip).toBe("idle");
  });

  it("is never overridden by walking, a scheduled action, a resident or a conversation", () => {
    for (const traveling of [true, false]) {
      for (const snapshot of [motion, drinking]) {
        const pose = scene({ idleSeconds: 4, speaking: false, speechSeconds: 0 }, snapshot, traveling);
        expect(pose).toMatchObject({ showResident: false, conversation: false, travelerLeanRadians: 0 });
        expect(pose.traveler.clip).toBe("idle");
      }
    }
  });

  it("leaves the live path exactly as it was when there is no preview", () => {
    expect(scene(undefined).traveler.clip).toBe("wait_pockets");
    expect(scene(undefined, motion, true).traveler.clip).toBe("walk");
  });
});
