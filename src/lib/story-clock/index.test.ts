import { describe, expect, it } from "vitest";
import { tashkentCountryPack } from "@/content/countries/tashkent.v1";
import type { ScheduledEventView } from "@/lib/contracts";
import {
  activeDialogueLineIndex,
  deterministicAmbientAction,
  estimatedServerNow,
  eventProgress,
  synchronizeClock,
} from ".";

const event: ScheduledEventView = {
  id: "event",
  type: "encounter",
  startsAt: "2026-09-01T00:00:00.000Z",
  durationSeconds: 20,
  status: "scheduled",
  lines: [
    { speaker: "traveler", text: "Hello", mood: "curious", durationMs: 2_000 },
    { speaker: "npc", text: "Welcome", mood: "amused", durationMs: 3_000 },
  ],
};

describe("server story clock", () => {
  it("keeps a stable server offset", () => {
    const clock = synchronizeClock("2026-09-01T00:00:10.000Z", 1_000);
    expect(estimatedServerNow(clock, 2_500)).toBe(
      new Date("2026-09-01T00:00:11.500Z").getTime(),
    );
  });

  it("interpolates an isolated accelerated rehearsal between heartbeats", () => {
    const clock = synchronizeClock("2026-09-01T00:00:00.000Z", 1_000, 144);
    expect(estimatedServerNow(clock, 2_000)).toBe(
      new Date("2026-09-01T00:02:24.000Z").getTime(),
    );
  });

  it("clamps scheduled event progress", () => {
    expect(eventProgress(event, new Date("2026-08-31T23:59:59Z").getTime())).toBe(0);
    expect(eventProgress(event, new Date("2026-09-01T00:00:10Z").getTime())).toBe(0.5);
    expect(eventProgress(event, new Date("2026-09-01T00:01:00Z").getTime())).toBe(1);
  });

  it("selects dialogue lines from absolute elapsed time", () => {
    expect(activeDialogueLineIndex(event, new Date("2026-09-01T00:00:04.500Z").getTime())).toBe(0);
    expect(activeDialogueLineIndex(event, new Date("2026-09-01T00:00:06.500Z").getTime())).toBe(1);
  });

  it("selects the same ambient action for every client in a UTC window", () => {
    const timestamp = 1_788_240_030_000;
    expect(deterministicAmbientAction(tashkentCountryPack, timestamp)).toEqual(
      deterministicAmbientAction(tashkentCountryPack, timestamp + 2_000),
    );
  });
});
