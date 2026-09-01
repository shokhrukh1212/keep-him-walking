import { describe, expect, it } from "vitest";
import { encounterPhaseAt } from "./encounter-timeline";
import { motionPhaseAt } from "./motion-machine";

describe("traveler motion state machine", () => {
  it("starts, walks, slows, stops and rests", () => {
    expect(motionPhaseAt({ desiredWalking: true, changedAtMs: 0 }, 200, false)).toBe("start_walk");
    expect(motionPhaseAt({ desiredWalking: true, changedAtMs: 0 }, 900, false)).toBe("walk");
    expect(motionPhaseAt({ desiredWalking: false, changedAtMs: 1_000 }, 1_200, true)).toBe("slow_walk");
    expect(motionPhaseAt({ desiredWalking: false, changedAtMs: 1_000 }, 1_800, true)).toBe("stop");
    expect(motionPhaseAt({ desiredWalking: false, changedAtMs: 1_000 }, 2_200, true)).toBe("rest");
    expect(motionPhaseAt({ desiredWalking: true, changedAtMs: 3_000 }, 3_200, true)).toBe("resume_walk");
  });

  it("runs the encounter through focus and restore phases", () => {
    expect(encounterPhaseAt(0.03)).toBe("notice");
    expect(encounterPhaseAt(0.1)).toBe("decelerate");
    expect(encounterPhaseAt(0.2)).toBe("approach");
    expect(encounterPhaseAt(0.5)).toBe("dialogue");
    expect(encounterPhaseAt(0.78)).toBe("goodbye");
    expect(encounterPhaseAt(0.86)).toBe("restore");
    expect(encounterPhaseAt(0.96)).toBe("restore");
  });
});
