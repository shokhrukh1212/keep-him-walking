import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHintRefresher } from "./hint-refresh";

describe("createHintRefresher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers a burst of hints with one read after a short random wait", async () => {
    const run = vi.fn(async () => undefined);
    const refresher = createHintRefresher(run, { minSpacingMs: 1_000, jitterMs: 400, random: () => 0.5 });
    for (let index = 0; index < 100; index += 1) refresher.request();
    await vi.advanceTimersByTimeAsync(199);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reads once more after hints that arrived mid-read, and no sooner than the spacing", async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const refresher = createHintRefresher(run, { minSpacingMs: 1_000, jitterMs: 0 });
    refresher.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    refresher.request();
    refresher.request();
    finish();
    await vi.advanceTimersByTimeAsync(999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("holds a flood of hints to one read a second", async () => {
    const run = vi.fn(async () => undefined);
    const refresher = createHintRefresher(run, { minSpacingMs: 1_000, jitterMs: 0 });
    for (let elapsed = 0; elapsed < 10_000; elapsed += 10) {
      refresher.request();
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(run.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("keeps working after a read fails", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const refresher = createHintRefresher(run, { minSpacingMs: 1_000, jitterMs: 0 });
    refresher.request();
    await vi.advanceTimersByTimeAsync(0);
    refresher.request();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stops for good when cancelled", async () => {
    const run = vi.fn(async () => undefined);
    const refresher = createHintRefresher(run, { minSpacingMs: 1_000, jitterMs: 400, random: () => 1 });
    refresher.request();
    refresher.cancel();
    refresher.request();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).not.toHaveBeenCalled();
  });
});
