import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import type { ScheduledActionView } from "@/lib/contracts";
import {
  actionDurationSeconds,
  conversationDurationSeconds,
  conversationScripts,
  conversationSpeakerName,
} from "@/lib/world/activities";
import {
  METRES_PER_SECOND,
  METRES_PER_STEP,
  crowdActionKindOf,
  travelerMotionAt,
  visibleStepsBetween,
} from "./motion-clock";

const pack = tashkentCountryPackV4;

function stop(kind: ScheduledActionView["kind"], at: number, extra: Partial<ScheduledActionView> = {}): ScheduledActionView {
  const duration = kind === "conversation" || kind === "greeting" ? 20 : actionDurationSeconds(kind);
  return { kind, atActiveSecond: at, endsAtActiveSecond: at + duration, source: "system", ...extra };
}

describe("traveler motion clock", () => {
  it("counts one step per 600ms plant and travels 750mm per plant", () => {
    const start = 20;
    const before = travelerMotionAt(pack, start);
    const after = travelerMotionAt(pack, start + 12);
    expect(after.plantIndex - before.plantIndex).toBe(20);
    expect(after.distanceMetres - before.distanceMetres).toBeCloseTo(20 * METRES_PER_STEP, 5);
    expect(visibleStepsBetween(pack, start, start + 12)).toBe(20);
  });

  it("always returns one of the six approved gait poses", () => {
    for (let sample = 0; sample < 120; sample += 1) {
      const frame = travelerMotionAt(pack, 20 + sample / 20).gaitFrameIndex;
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(6);
    }
  });

  it("does not invent a stop the server has not scheduled", () => {
    for (let seconds = 0; seconds < 7_200; seconds += 7) {
      expect(travelerMotionAt(pack, seconds).action).toBeNull();
    }
  });
});

describe("server-scheduled stops", () => {
  const quietDistance = 9_000;

  it("plays a stop on the planted-foot grid for its natural length", () => {
    const rows = [stop("drink", 100)];
    const during = travelerMotionAt(pack, 101, quietDistance, rows);
    expect(during.action).toMatchObject({
      kind: "drink",
      source: "system",
      state: "drink",
      clip: "drink",
      label: "Taking a drink",
      durationSeconds: actionDurationSeconds("drink"),
    });
    // 100 s is not a plant boundary: it snaps to 100.2 s, the 167th footfall.
    expect(during.action?.elapsedSeconds).toBeCloseTo(0.8, 5);
  });

  it("does not play before its window or after it ends", () => {
    const rows = [stop("look_around", 200)];
    expect(travelerMotionAt(pack, 199, quietDistance, rows).action).toBeNull();
    expect(travelerMotionAt(pack, 200 + actionDurationSeconds("look_around") + 1, quietDistance, rows).action).toBeNull();
  });

  it("holds the gait and the walking clock through a stop, then resumes on the same foot", () => {
    const rows = [stop("phone", 300)];
    const atStart = travelerMotionAt(pack, 300, quietDistance, rows);
    const during = travelerMotionAt(pack, 310, quietDistance, rows);
    const after = travelerMotionAt(pack, 300 + actionDurationSeconds("phone") + 1.2, quietDistance, rows);
    expect(during.routeSeconds).toBe(atStart.routeSeconds);
    expect(during.plantIndex).toBe(atStart.plantIndex);
    expect(during.speedFactor).toBe(0);
    expect(after.action).toBeNull();
    expect(after.routeSeconds).toBeCloseTo(atStart.routeSeconds + 1.2, 5);
    expect(after.plantIndex).toBe(atStart.plantIndex + 2);
    expect(after.plantedFoot).toBe(atStart.plantedFoot);
  });

  it("ignores cancelled and malformed rows rather than inventing a stop", () => {
    expect(travelerMotionAt(pack, 101, quietDistance, [stop("yawn", 100, { cancelled: true })]).action).toBeNull();
    expect(travelerMotionAt(pack, 101, quietDistance, [stop("yawn", Number.NaN)]).action).toBeNull();
  });

  it("computes the identical frame for two clients with the same rows in any order", () => {
    const rows = [stop("photo", 400, { source: undefined }), stop("stretch", 600)];
    const reversed = [...rows].reverse();
    for (let offset = 0; offset <= 12; offset += 0.25) {
      expect(travelerMotionAt(pack, 400 + offset, quietDistance, rows))
        .toEqual(travelerMotionAt(pack, 400 + offset, quietDistance, reversed));
    }
  });

  it("names crowd reactions separately from his own actions", () => {
    const crowd = travelerMotionAt(pack, 101, quietDistance, [stop("wave", 100, { source: undefined })]);
    expect(crowdActionKindOf(crowd.action)).toBe("wave");
    expect(crowd.action?.label).toBe("Waving back");
    const own = travelerMotionAt(pack, 101, quietDistance, [stop("drink", 100)]);
    expect(crowdActionKindOf(own.action)).toBeNull();
  });

  it("stays on the server's walking-clock anchor after old rows age out", () => {
    const clock = { anchorActiveSeconds: 5_000, heldActiveSeconds: 1_200 };
    expect(travelerMotionAt(pack, 5_010, quietDistance, [], clock).routeSeconds).toBe(3_810);
  });
});

describe("conversations", () => {
  const script = conversationScripts(pack)[0]!;
  const duration = conversationDurationSeconds(script.lines);
  const rows = [stop("conversation", 300, { variant: script.id, endsAtActiveSecond: 300 + duration })];

  it("follows the reviewed script, phase by phase, at natural lengths", () => {
    const at = (seconds: number) => travelerMotionAt(pack, 300 + seconds, 9_000, rows).action!;
    expect(at(0.5)).toMatchObject({ kind: "conversation", conversationPhase: "notice", state: "notice" });
    expect(at(1.5).conversationPhase).toBe("stop");
    expect(at(3.2)).toMatchObject({ conversationPhase: "greet", state: "greet" });
    const firstLine = at(2.2 + 4.73 + 0.1);
    expect(firstLine.dialogueLineIndex).toBe(0);
    expect(firstLine.conversationPhase).toBe(script.lines[0]!.speaker === "traveler" ? "talk" : "listen");
    expect(firstLine.conversation?.lines).toEqual(script.lines);
    expect(firstLine.label).toBe(`Talking with ${conversationSpeakerName(pack, script)}`);
    expect(at(duration - 0.5).conversationPhase).toBe("goodbye");
  });

  it("labels a wordless greeting honestly and plays a missing script as one", () => {
    const greeting = travelerMotionAt(pack, 400.5, 9_000, [stop("greeting", 400)]).action!;
    expect(greeting.label).toBe("Saying hello");
    expect(greeting.conversation?.lines).toEqual([]);
    const missing = travelerMotionAt(pack, 500.5, 9_000, [stop("conversation", 500, { variant: "retired-script" })]).action!;
    expect(missing.kind).toBe("greeting");
    expect(missing.label).toBe("Saying hello");
    expect(missing.conversation?.lines).toEqual([]);
  });

  it("walks the pavement at his own speed outside every stop", () => {
    const walking = travelerMotionAt(pack, 50, 50 * METRES_PER_SECOND, rows);
    expect(walking.action).toBeNull();
    expect(walking.speedFactor).toBe(1);
  });
});
