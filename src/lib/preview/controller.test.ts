import { describe, expect, it, vi } from "vitest";
import { SCHEDULER_FIXTURE_LINES as PRELAUNCH_MONOLOGUES } from "./fixture-lines";
import { PreviewMonologueController, type PreviewControllerOptions } from "./controller";
import { PREVIEW_INTERVAL_SECONDS, monologueTimeline } from "./monologue";

const FIRST_LINE_MS = monologueTimeline(PRELAUNCH_MONOLOGUES[0]!.text).durationSeconds * 1_000;
const INTERVAL_MS = PREVIEW_INTERVAL_SECONDS * 1_000;

/** A controller on a fake page clock, fake timers and a fake visibility state. */
function harness(options: Partial<PreviewControllerOptions> = {}) {
  let nowMs = 1_000;
  let nextTimer = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const visibilityListeners = new Set<() => void>();
  const page = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_type: string, listener: () => void) => visibilityListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => visibilityListeners.delete(listener),
  };
  const controller = new PreviewMonologueController({
    lines: PRELAUNCH_MONOLOGUES,
    cityName: "Paris",
    seasonNumber: 1,
    now: () => nowMs,
    visibility: () => page as unknown as Document,
    setTimer: (callback, delayMs) => {
      const id = nextTimer++;
      timers.set(id, { at: nowMs + delayMs, callback });
      return id;
    },
    clearTimer: (id) => { timers.delete(id as number); },
    ...options,
  });
  const notifications: string[] = [];
  controller.subscribe(() => {
    const caption = controller.getSnapshot();
    notifications.push(caption.speaking ? `${caption.lineId}#${caption.cueIndex}` : "idle");
  });
  /** Moves the page clock forward, firing every due timer at its own moment. */
  const advance = (ms: number) => {
    const end = nowMs + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      nowMs = due[1].at;
      due[1].callback();
    }
    nowMs = end;
  };
  const setVisible = (visible: boolean) => {
    page.visibilityState = visible ? "visible" : "hidden";
    for (const listener of [...visibilityListeners]) listener();
  };
  return { controller, advance, setVisible, timers, visibilityListeners, notifications, now: () => nowMs };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("preview monologue controller", () => {
  it("waits for the model, speaks five seconds later and hides the caption exactly when he stops", () => {
    const { controller, advance, timers, notifications, now } = harness();
    controller.start();
    advance(30_000);
    expect(controller.getSnapshot().speaking).toBe(false);
    controller.setModelReady();
    advance(4_990);
    expect(controller.getSnapshot().speaking).toBe(false);
    advance(20);
    expect(controller.getSnapshot()).toMatchObject({ speaking: true, lineId: "waiting-in-paris", cueIndex: 0, sequence: 1 });
    expect(controller.getSnapshot().lineText).toContain("Once Season 1 starts");
    expect(controller.sample(now())).toMatchObject({ speaking: true });
    expect(timers.size).toBe(1);
    advance(FIRST_LINE_MS - 40);
    expect(controller.getSnapshot()).toMatchObject({ speaking: true, cueIndex: 1 });
    advance(40);
    expect(controller.getSnapshot().speaking).toBe(false);
    expect(controller.sample(now()).speaking).toBe(false);
    expect(timers.size).toBe(1);
    // Only real changes notify: the start, the second cue and the end.
    expect(notifications).toEqual(["waiting-in-paris#0", "waiting-in-paris#1", "idle"]);
  });

  it("keeps one timer and one listener through a StrictMode start, stop and start", () => {
    const { controller, timers, visibilityListeners } = harness();
    controller.start();
    controller.stop();
    controller.start();
    controller.setModelReady();
    expect(timers.size).toBe(1);
    expect(visibilityListeners.size).toBe(1);
    controller.stop();
    expect(timers.size).toBe(0);
    expect(visibilityListeners.size).toBe(0);
  });

  it("ends a speech at once when the preview stops, leaving no caption behind", () => {
    const { controller, advance, now } = harness();
    controller.start();
    controller.setModelReady();
    advance(6_000);
    expect(controller.getSnapshot().speaking).toBe(true);
    controller.stop();
    expect(controller.getSnapshot().speaking).toBe(false);
    expect(controller.sample(now()).speaking).toBe(false);
  });

  it("pauses the schedule and the speech while hidden and resumes without catching up", () => {
    const { controller, advance, setVisible, timers, now } = harness();
    controller.start();
    controller.setModelReady();
    advance(8_000);
    const during = controller.getSnapshot();
    expect(during.speaking).toBe(true);
    setVisible(false);
    expect(timers.size).toBe(0);
    advance(10 * 60_000);
    expect(controller.getSnapshot()).toBe(during);
    expect(controller.sample(now()).speechSeconds).toBeCloseTo(3, 1);
    setVisible(true);
    advance(2_000);
    expect(controller.sample(now()).speechSeconds).toBeCloseTo(5, 1);
    // The next line is 180 visible seconds after the first began (at 5 s), and it is the only one.
    advance(5_000 + INTERVAL_MS - 10_000 - 10);
    expect(controller.getSnapshot().sequence).toBe(1);
    advance(20);
    expect(controller.getSnapshot()).toMatchObject({ speaking: true, sequence: 2, lineId: "packed-for-seven" });
  });

  it("holds a start behind a modal and plays it once when the modal closes", () => {
    const { controller, advance } = harness();
    controller.start();
    controller.setModelReady();
    controller.setDeferred(true);
    advance(60_000);
    expect(controller.getSnapshot().sequence).toBe(0);
    controller.setDeferred(false);
    expect(controller.getSnapshot()).toMatchObject({ speaking: true, sequence: 1 });
    advance(INTERVAL_MS - 10);
    expect(controller.getSnapshot().sequence).toBe(1);
    advance(20);
    expect(controller.getSnapshot().sequence).toBe(2);
  });

  it("lets a speech that is already under way finish beneath a modal", () => {
    const { controller, advance } = harness();
    controller.start();
    controller.setModelReady();
    advance(6_000);
    controller.setDeferred(true);
    expect(controller.getSnapshot().speaking).toBe(true);
    advance(FIRST_LINE_MS);
    expect(controller.getSnapshot()).toMatchObject({ speaking: false, sequence: 1 });
  });

  it("keeps the caption on schedule under reduced motion while he stays idle", () => {
    const { controller, advance, now } = harness();
    controller.setReducedMotion(true);
    controller.start();
    controller.setModelReady();
    advance(5_010);
    expect(controller.getSnapshot().speaking).toBe(true);
    expect(controller.sample(now())).toMatchObject({ speaking: false, speechSeconds: expect.any(Number) });
  });

  it.each([
    ["open", async () => true, "looking-for-a-sponsor"],
    ["closed", async () => false, "looking-for-a-sponsor.fallback"],
    ["unreadable", async () => { throw new Error("offline"); }, "looking-for-a-sponsor.fallback"],
  ])("asks once, an interval ahead, and uses the sponsor line only when %s means open", async (_label, answer, expected) => {
    const loadSponsorOpen = vi.fn(answer);
    const { controller, advance } = harness({ loadSponsorOpen });
    controller.start();
    controller.setModelReady();
    advance(5_010);
    for (let started = 1; started < 7; started += 1) {
      await flush();
      advance(INTERVAL_MS);
    }
    expect(controller.getSnapshot()).toMatchObject({ sequence: 7, lineId: expected });
    expect(loadSponsorOpen).toHaveBeenCalledTimes(1);
    expect(loadSponsorOpen).toHaveBeenCalledWith(1);
  });
});

describe("the controller's wall clock", () => {
  it("drops a dated Anniversary Journey line once the synchronized clock passes its moment", async () => {
    const { PRELAUNCH_MONOLOGUES: lines } = await import("@/content/prelaunch/monologues");
    const { PreviewMonologueController } = await import("./controller");
    let now = 0;
    let wake: (() => void) | null = null;
    const controller = new PreviewMonologueController({
      lines,
      now: () => now,
      visibility: () => null,
      setTimer: (callback) => { wake = callback; return 1; },
      clearTimer: () => { wake = null; },
    });
    controller.setWallClock(Date.parse("2026-09-17T16:00:00Z"));
    controller.start();
    controller.setModelReady();
    now = 5_000;
    (wake as (() => void) | null)?.();
    expect(controller.getSnapshot().lineText).toBe("My maker’s first wedding anniversary is October 1.");
    controller.stop();
  });
});
