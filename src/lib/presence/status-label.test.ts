import { describe, expect, it } from "vitest";
import { walkingStatusLabel, type WalkingStatusInput } from "./status-label";

const base: WalkingStatusInput = {
  journeyState: "live",
  mode: "live",
  wakeCountdown: null,
  walking: true,
  actionLabel: null,
  renderedPlaceLabel: "Marais market",
  weatherFragment: null,
  connection: "live",
  lastConfirmedWalking: true,
  waitingSinceLocalTime: null,
  sleeping: false,
};

describe("walking status", () => {
  it("names walking, the drawn place and any stop", () => {
    expect(walkingStatusLabel(base)).toEqual({ text: "Walking to Marais market", tone: "walking" });
    expect(walkingStatusLabel({ ...base, weatherFragment: "in the rain" }).text).toBe("Walking in the rain to Marais market");
    expect(walkingStatusLabel({ ...base, renderedPlaceLabel: null }).text).toBe("Walking");
    expect(walkingStatusLabel({ ...base, actionLabel: "Tying a shoe" })).toEqual({ text: "Tying a shoe", tone: "stopped" });
  });

  it("says Reconnecting when this browser lost its confirmation, not that nobody is watching", () => {
    expect(walkingStatusLabel({ ...base, walking: false })).toEqual({ text: "Reconnecting…", tone: "reconnecting" });
    expect(walkingStatusLabel({ ...base, walking: false, connection: "reconnecting", lastConfirmedWalking: false }).text)
      .toBe("Reconnecting…");
    expect(walkingStatusLabel({ ...base, walking: false, connection: "offline" }).tone).toBe("reconnecting");
  });

  it("says he is waiting only when the server confirmed an empty audience", () => {
    const waiting = { ...base, walking: false, lastConfirmedWalking: false, waitingSinceLocalTime: "11:17" };
    expect(walkingStatusLabel(waiting)).toEqual({ text: "Waiting for the internet · since 11:17", tone: "waiting" });
    expect(walkingStatusLabel({ ...waiting, sleeping: true }).text).toBe("Asleep · since 11:17");
    expect(walkingStatusLabel({ ...base, walking: false, lastConfirmedWalking: false }).text).toBe("Waiting for the internet");
  });

  it("says Joining before this browser's first confirmation, unless it is really offline", () => {
    const fresh = { ...base, walking: false, lastConfirmedWalking: false, connection: "reconnecting" as const, joining: true };
    expect(walkingStatusLabel(fresh)).toEqual({ text: "Joining the walk…", tone: "reconnecting" });
    // Someone else is already watching: he is simply walking.
    expect(walkingStatusLabel({ ...fresh, walking: true }).text).toBe("Walking to Marais market");
    // An empty audience is not announced before this visitor has been counted.
    expect(walkingStatusLabel({ ...fresh, waitingSinceLocalTime: "11:17" }).text).toBe("Joining the walk…");
    expect(walkingStatusLabel({ ...fresh, connection: "offline" }).text).toBe("You're offline · reconnecting when you're back");
  });

  it("keeps prelaunch, preview and waking states explicit", () => {
    const prelaunch = { ...base, journeyState: "prelaunch" as const, mode: "prelaunch" as const, walking: false, connection: "scheduled" as const };
    expect(walkingStatusLabel(prelaunch)).toEqual({ text: "Season 1 is preparing to begin.", tone: "prelaunch" });
    expect(walkingStatusLabel({ ...prelaunch, seasonNumber: 2 }).text).toBe("Season 2 is preparing to begin.");
    // A real outage is still an outage, never dressed up as a prelaunch.
    expect(walkingStatusLabel({ ...base, mode: "offline_preview" }).text).toBe("Preview only · waiting for the live journey");
    expect(walkingStatusLabel({ ...base, mode: "offline_preview" }).tone).toBe("preview");
    expect(walkingStatusLabel({ ...base, wakeCountdown: 2 }).text).toBe("Waking up · starts walking in 2…");
  });

  it("names a finished season rather than a wait or a lost connection", () => {
    expect(walkingStatusLabel({ ...base, journeyState: "completed", mode: "completed", connection: "scheduled" }))
      .toEqual({ text: "Season complete", tone: "complete" });
  });
});
