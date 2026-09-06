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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useJourneyPresence country rollover", () => {
  it("aborts a stalled request and retries instead of locking presence forever",async()=>{
    vi.useFakeTimers();
    const fetchMock=vi.fn()
      .mockImplementationOnce((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener("abort",()=>reject(new Error("aborted")))))
      .mockResolvedValue({ok:true,json:async()=>heartbeatResponse});
    vi.stubGlobal("fetch",fetchMock);
    const onHeartbeat=vi.fn();
    const {unmount}=renderHook(()=>useJourneyPresence({snapshot:snapshot("day-1"),sceneReady:true,onHeartbeat}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(13_001);});
    expect(fetchMock).toHaveBeenCalledTimes(2);expect(onHeartbeat).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("rejects a late response belonging to another country",async()=>{
    vi.useFakeTimers();
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({...heartbeatResponse,countryDayId:"old-day"})});
    vi.stubGlobal("fetch",fetchMock);const onHeartbeat=vi.fn();
    const {unmount,result}=renderHook(()=>useJourneyPresence({snapshot:snapshot("day-2"),sceneReady:true,onHeartbeat}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
    expect(onHeartbeat).not.toHaveBeenCalled();expect(result.current).toBe("reconnecting");unmount();
  });

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
