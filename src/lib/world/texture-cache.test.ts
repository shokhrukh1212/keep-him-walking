import { describe, expect, it, vi } from "vitest";
import { PlaceTextureCache, textureRetryDelayMs } from "./texture-cache";

function fakeSource() {
  const loaded = new Set<string>();
  const failing = new Set<string>();
  return {
    loaded,
    failing,
    source: {
      load: vi.fn(async (url: string) => {
        if (failing.has(url)) throw new Error(`404 ${url}`);
        loaded.add(url);
        return { url };
      }),
      unload: vi.fn((url: string) => { loaded.delete(url); }),
    },
  };
}

describe("place texture cache", () => {
  it("shares a texture between places and frees it only when nobody holds it", async () => {
    const { source, loaded } = fakeSource();
    const cache = new PlaceTextureCache(source);
    await cache.acquire("/a.webp");
    await cache.acquire("/a.webp");
    expect(source.load).toHaveBeenCalledTimes(1);
    cache.release("/a.webp");
    expect(cache.drainOne()).toBeNull();
    cache.release("/a.webp");
    expect(cache.drainOne()).toBe("/a.webp");
    await Promise.resolve();
    await Promise.resolve();
    expect(loaded.has("/a.webp")).toBe(false);
    expect(cache.held()).toEqual([]);
  });

  it("frees released textures one per call, and keeps one re-acquired in time", async () => {
    const { source } = fakeSource();
    const cache = new PlaceTextureCache(source);
    await Promise.all(["/a.webp", "/b.webp", "/c.webp"].map((url) => cache.acquire(url)));
    ["/a.webp", "/b.webp", "/c.webp"].forEach((url) => cache.release(url));
    expect(cache.pendingReleases()).toBe(3);
    await cache.acquire("/b.webp");
    expect(cache.drainOne()).toBe("/a.webp");
    expect(cache.drainOne()).toBe("/c.webp");
    expect(cache.drainOne()).toBeNull();
    expect(cache.held()).toEqual(["/b.webp"]);
  });

  it("forgets a failed load so the next attempt fetches again", async () => {
    const { source, failing } = fakeSource();
    failing.add("/missing.webp");
    const cache = new PlaceTextureCache(source);
    await expect(cache.acquire("/missing.webp")).rejects.toThrow("404");
    expect(cache.held()).toEqual([]);
    failing.delete("/missing.webp");
    await expect(cache.acquire("/missing.webp")).resolves.toEqual({ url: "/missing.webp" });
    expect(source.load).toHaveBeenCalledTimes(2);
  });

  it("backs off quickly, then gently", () => {
    expect([0, 1, 2, 3, 9].map(textureRetryDelayMs)).toEqual([2_000, 5_000, 15_000, 30_000, 30_000]);
  });
});
