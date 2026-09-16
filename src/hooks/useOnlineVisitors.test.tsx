import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_AUDIENCE_COUNTS, ONLINE_VISITORS_REFRESH_MS, mergeAudienceRead, useOnlineVisitors } from "./useOnlineVisitors";

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

describe("mergeAudienceRead", () => {
  const first = mergeAudienceRead(INITIAL_AUDIENCE_COUNTS, { online: 4, allTime: 12, fetchedAt: "2026-09-16T10:00:00.000Z" }, "2026-09-16T10:00:01.000Z");

  it("keeps each count with the time DataFast answered it", () => {
    expect(first).toEqual({
      online: 4,
      metrics: {
        online: { value: 4, fetchedAt: "2026-09-16T10:00:00.000Z" },
        allTime: { value: 12, fetchedAt: "2026-09-16T10:00:00.000Z" },
      },
      failedAt: null,
    });
  });

  it("keeps the last good, dated values after a failed read and never turns a failure into zero", () => {
    const failed = mergeAudienceRead(first, null, "2026-09-16T10:01:00.000Z");
    expect(failed.online).toBeNull();
    expect(failed.metrics.online).toEqual({ value: 4, fetchedAt: "2026-09-16T10:00:00.000Z" });
    expect(failed.metrics.allTime).toEqual({ value: 12, fetchedAt: "2026-09-16T10:00:00.000Z" });
    expect(failed.failedAt).toBe("2026-09-16T10:01:00.000Z");
    expect(mergeAudienceRead(INITIAL_AUDIENCE_COUNTS, { online: null, allTime: -1 }, "2026-09-16T10:02:00.000Z").metrics)
      .toEqual({ online: null, allTime: null });
  });

  it("updates one metric and keeps the other dated when only one is answered", () => {
    const partial = mergeAudienceRead(first, { online: 6, allTime: null, fetchedAt: "2026-09-16T10:05:00.000Z" }, "2026-09-16T10:05:01.000Z");
    expect(partial.metrics.online).toEqual({ value: 6, fetchedAt: "2026-09-16T10:05:00.000Z" });
    expect(partial.metrics.allTime).toEqual({ value: 12, fetchedAt: "2026-09-16T10:00:00.000Z" });
    expect(partial.failedAt).toBe("2026-09-16T10:05:01.000Z");
  });
});
