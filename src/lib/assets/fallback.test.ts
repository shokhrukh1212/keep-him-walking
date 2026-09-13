import { describe, expect, it } from "vitest";
import { LOCAL_SCENE_FALLBACK_URL, localSceneFallbackAfter } from "./fallback";

describe("localSceneFallbackAfter", () => {
  it("retries a failed CDN painting once at the compact same-origin poster", () => {
    expect(localSceneFallbackAfter("https://assets.keephimwalking.com/scenes/paris/v3/places/x.webp"))
      .toBe(LOCAL_SCENE_FALLBACK_URL);
    expect(localSceneFallbackAfter(LOCAL_SCENE_FALLBACK_URL)).toBeNull();
  });
});
