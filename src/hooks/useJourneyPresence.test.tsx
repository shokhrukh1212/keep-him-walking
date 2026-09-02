import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapSnapshot, HeartbeatResponse } from "@/lib/contracts";
import { useJourneyPresence } from "./useJourneyPresence";

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabase: () => null,
}));

const heartbeatResponse: HeartbeatResponse = {
  serverNow: "2026-09-03T00:00:00.000Z",
  realServerNow: "2026-09-03T00:00:00.000Z",
  storyScale: 144,
  activeViewers: 1,
  walking: true,
  globalSteps: 1,
  visitorActiveSeconds: 1,
  ttlSeconds: 50,
  nextHeartbeatInMs: 60_000,
  globalActiveSeconds: 1,
  routeAuthoritativeAt: "2026-09-03T00:00:00.000Z",
};

function snapshot(countryDayId: string): BootstrapSnapshot {
  return {
    mode: "live",
    presence: { status: "live", activeViewers: 1, ttlSeconds: 50 },
    countryDay: { id: countryDayId },
  } as unknown as BootstrapSnapshot;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useJourneyPresence country rollover", () => {
  it("starts the new day active without sending an inactive cleanup heartbeat", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => heartbeatResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    const onHeartbeat = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ day }) => useJourneyPresence({ snapshot: snapshot(day), sceneReady: true, onHeartbeat }),
      { initialProps: { day: "day-1" } },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ day: "day-2" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const states = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).state);
    expect(states).toEqual(["active", "active"]);

    act(() => window.dispatchEvent(new Event("pagehide")));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).state).toBe("inactive");
    unmount();
  });
});
