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
  globalDistanceMetres: 1.25,
  paceRate: 1,
  routeAuthoritativeAt: "2026-09-03T00:00:00.000Z",
  waitingSince: null,
  wokeHim: false,
  countryCode: "ZZ",
  reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
  weather: null,
};

function snapshot(countryDayId: string): BootstrapSnapshot {
  return {
    mode: "live",
    presence: { status: "live", activeViewers: 1, ttlSeconds: 50, waitingSince: null },
    countryDay: { id: countryDayId, countryCode: "UZ" },
    reactions: { counts: { wave: 2, water: 1, photo: 0 }, scheduled: [], nextScheduledAction: null },
    weather: null,
  } as unknown as BootstrapSnapshot;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useJourneyPresence country rollover", () => {
  it("retains confirmed presentation fields from bootstrap during a rolling deploy", async () => {
    const legacyResponse = {
      ...heartbeatResponse,
      realServerNow: undefined,
      waitingSince: undefined,
      wokeHim: undefined,
      countryCode: undefined,
      reactions: undefined,
      weather: undefined,
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => legacyResponse });
    vi.stubGlobal("fetch", fetchMock);
    const onHeartbeat = vi.fn();
    const currentSnapshot = snapshot("day-1");
    const { unmount } = renderHook(() => useJourneyPresence({
      snapshot: currentSnapshot,
      sceneReady: true,
      onHeartbeat,
    }));

    await waitFor(() => expect(onHeartbeat).toHaveBeenCalledTimes(1));
    expect(onHeartbeat).toHaveBeenCalledWith(expect.objectContaining({
      realServerNow: legacyResponse.serverNow,
      waitingSince: null,
      wokeHim: false,
      countryCode: "UZ",
      reactions: currentSnapshot.reactions,
      weather: null,
    }));
    unmount();
  });

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
    expect(onHeartbeat).not.toHaveBeenCalled();expect(result.current.status).toBe("reconnecting");unmount();
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

  it("keeps one presence lifecycle while presentation payloads refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => heartbeatResponse });
    vi.stubGlobal("fetch", fetchMock);
    const onHeartbeat = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ reactionCount }) => {
        const current = snapshot("day-1");
        current.reactions.counts.wave = reactionCount;
        return useJourneyPresence({ snapshot: current, sceneReady: true, onHeartbeat });
      },
      { initialProps: { reactionCount: 0 } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ reactionCount: 1 });
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });
});
