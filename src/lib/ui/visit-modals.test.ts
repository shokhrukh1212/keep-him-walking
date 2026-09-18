import { describe, expect, it } from "vitest";
import {
  IDLE_WATCH_CLOCK,
  INTRO_DELAY_MS,
  INTRO_TO_SUPPORT_GAP_MS,
  SUPPORT_ACTIVE_MS,
  UNBLOCKED_SETTLE_MS,
  hasSponsorReferral,
  nextVisitModal,
  visitModalsSettled,
  watchClockActiveMs,
  watchClockAt,
  type VisitModalState,
} from "@/lib/ui/visit-modals";

const NOW = 1_800_000_000_000;

function state(overrides: Partial<VisitModalState> = {}): VisitModalState {
  return {
    nowMs: NOW,
    openModal: null,
    introShownAtMs: null,
    supportShownAtMs: null,
    returningVisitor: false,
    sponsorReferral: false,
    sceneReadyAtMs: NOW - INTRO_DELAY_MS,
    activeWatchMs: 0,
    supportEligible: true,
    blocked: false,
    unblockedAtMs: null,
    introClosedAtMs: null,
    ...overrides,
  };
}

describe("nextVisitModal", () => {
  it("shows the introduction once the scene has been up for the delay", () => {
    expect(nextVisitModal(state({ sceneReadyAtMs: NOW - INTRO_DELAY_MS + 1 }))).toBeNull();
    expect(nextVisitModal(state())).toBe("intro");
  });

  it("waits for the scene", () => {
    expect(nextVisitModal(state({ sceneReadyAtMs: null }))).toBeNull();
  });

  it("never shows the introduction twice, in this session or any other", () => {
    expect(nextVisitModal(state({ introShownAtMs: NOW - 5_000 }))).toBeNull();
  });

  it("never shows the introduction to a visitor the server already knows", () => {
    expect(nextVisitModal(state({ returningVisitor: true }))).toBeNull();
  });

  it("shows neither modal in a session that arrived on a sponsor link", () => {
    expect(nextVisitModal(state({ sponsorReferral: true }))).toBeNull();
    expect(nextVisitModal(state({
      sponsorReferral: true,
      introShownAtMs: NOW - 10 * 60_000,
      activeWatchMs: SUPPORT_ACTIVE_MS,
    }))).toBeNull();
  });

  it("shows the support ask after the active-watching threshold", () => {
    const watched = { introShownAtMs: NOW - 600_000, introClosedAtMs: NOW - 600_000 };
    expect(nextVisitModal(state({ ...watched, activeWatchMs: SUPPORT_ACTIVE_MS - 1 }))).toBeNull();
    expect(nextVisitModal(state({ ...watched, activeWatchMs: SUPPORT_ACTIVE_MS }))).toBe("support");
  });

  it("keeps the support ask off a live journey it would misdescribe", () => {
    expect(nextVisitModal(state({
      introShownAtMs: NOW - 600_000,
      activeWatchMs: SUPPORT_ACTIVE_MS,
      supportEligible: false,
    }))).toBeNull();
  });

  it("holds the support ask for the gap after the introduction closes", () => {
    const watched = { introShownAtMs: NOW - 90_000, activeWatchMs: SUPPORT_ACTIVE_MS };
    expect(nextVisitModal(state({
      ...watched,
      introClosedAtMs: NOW - INTRO_TO_SUPPORT_GAP_MS + 1,
    }))).toBeNull();
    expect(nextVisitModal(state({
      ...watched,
      introClosedAtMs: NOW - INTRO_TO_SUPPORT_GAP_MS,
    }))).toBe("support");
  });

  it("queues rather than stacks: the introduction first, and only one at a time", () => {
    const both = state({ activeWatchMs: SUPPORT_ACTIVE_MS });
    expect(nextVisitModal(both)).toBe("intro");
    expect(nextVisitModal({ ...both, openModal: "intro" })).toBe("intro");
  });

  it("holds everything while another surface is open, and keeps it queued", () => {
    const blocked = state({ blocked: true });
    expect(nextVisitModal(blocked)).toBeNull();
    // Still owed once the way is clear: blocking postpones, it never cancels.
    expect(nextVisitModal({ ...blocked, blocked: false, unblockedAtMs: NOW - UNBLOCKED_SETTLE_MS })).toBe("intro");
  });

  it("lets the page settle after the blocking surface closes", () => {
    expect(nextVisitModal(state({ unblockedAtMs: NOW - UNBLOCKED_SETTLE_MS + 1 }))).toBeNull();
    expect(nextVisitModal(state({ unblockedAtMs: NOW - UNBLOCKED_SETTLE_MS }))).toBe("intro");
  });
});

describe("visitModalsSettled", () => {
  it("is settled once both have been shown", () => {
    expect(visitModalsSettled(state())).toBe(false);
    expect(visitModalsSettled(state({ introShownAtMs: NOW }))).toBe(false);
    expect(visitModalsSettled(state({ introShownAtMs: NOW, supportShownAtMs: NOW }))).toBe(true);
  });

  it("is settled at once for a sponsor referral, and never while one is open", () => {
    expect(visitModalsSettled(state({ sponsorReferral: true }))).toBe(true);
    expect(visitModalsSettled(state({
      sponsorReferral: true,
      openModal: "intro",
    }))).toBe(false);
  });
});

describe("watchClockAt", () => {
  it("counts only the stretches when the visitor was really watching", () => {
    let clock = watchClockAt(IDLE_WATCH_CLOCK, true, 0);
    expect(watchClockActiveMs(clock, 10_000)).toBe(10_000);
    // The tab goes away at ten seconds and comes back at a hundred.
    clock = watchClockAt(clock, false, 10_000);
    expect(watchClockActiveMs(clock, 100_000)).toBe(10_000);
    clock = watchClockAt(clock, true, 100_000);
    expect(watchClockActiveMs(clock, 105_000)).toBe(15_000);
  });

  it("ignores a repeated blur or a repeated focus", () => {
    const running = watchClockAt(IDLE_WATCH_CLOCK, true, 0);
    expect(watchClockAt(running, true, 5_000)).toBe(running);
    const stopped = watchClockAt(running, false, 5_000);
    expect(watchClockAt(stopped, false, 9_000)).toBe(stopped);
    expect(watchClockActiveMs(stopped, 60_000)).toBe(5_000);
  });

  it("never counts backwards when the wall clock jumps back", () => {
    const running = watchClockAt(IDLE_WATCH_CLOCK, true, 10_000);
    expect(watchClockActiveMs(running, 9_000)).toBe(0);
  });
});

describe("hasSponsorReferral", () => {
  it("recognises the parameters aimed at the sponsor flow", () => {
    expect(hasSponsorReferral("?ref=newsletter")).toBe(true);
    expect(hasSponsorReferral("?sponsor=acme")).toBe(true);
    expect(hasSponsorReferral("?panel=journey")).toBe(false);
    expect(hasSponsorReferral("")).toBe(false);
    // An empty value is not a referral.
    expect(hasSponsorReferral("?ref=")).toBe(false);
  });
});
