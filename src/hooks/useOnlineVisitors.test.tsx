import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ONLINE_VISITORS_REFRESH_MS, useOnlineVisitors } from "./useOnlineVisitors";

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useOnlineVisitors", () => {
  it("is pending until the first answer, then shows the online count", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => respond(200, { online: 7, last24Hours: 40, allTime: 900, fetchedAt: "2026-09-15T00:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOnlineVisitors());
    expect(result.current).toBeUndefined();
    await flush();
    expect(result.current).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith("/api/audience", expect.anything());
  });

  it("reports an unavailable count as null rather than a guess", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => respond(503, { error: { code: "UNAVAILABLE" } })));
    const { result } = renderHook(() => useOnlineVisitors());
    await flush();
    expect(result.current).toBeNull();
  });

  it("treats a missing online count as unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => respond(200, { online: null, last24Hours: 40, allTime: 900 })));
    const { result } = renderHook(() => useOnlineVisitors());
    await flush();
    expect(result.current).toBeNull();
  });

  it("asks again every minute and stops when unmounted", async () => {
    vi.useFakeTimers();
    let online = 3;
    const fetchMock = vi.fn(() => respond(200, { online: online++ }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useOnlineVisitors());
    await flush();
    expect(result.current).toBe(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(ONLINE_VISITORS_REFRESH_MS); });
    expect(result.current).toBe(4);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(ONLINE_VISITORS_REFRESH_MS * 3); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
