import { afterEach, describe, expect, it, vi } from "vitest";
import { assetUrl, publicAssetUrl, validateAssetBaseUrl } from "./url";

afterEach(() => vi.unstubAllEnvs());

describe("asset URLs", () => {
  it("preserves same-origin paths and revision strings without configuration", () => {
    for (const base of [undefined, "", "  "]) expect(assetUrl("/characters/v2/traveler.glb?rev=interactions-1", base)).toBe("/characters/v2/traveler.glb?rev=interactions-1");
  });
  it("mirrors all public trees while retaining their keys and cache revisions", () => {
    for (const root of ["characters", "scenes", "audio", "npcs"]) {
      expect(assetUrl(`/${root}/v1/file.webp?rev=2#fragment`, "https://assets.example.com/")).toBe(`https://assets.example.com/${root}/v1/file.webp?rev=2#fragment`);
    }
  });
  it("does not redirect sponsor URLs, API paths, or unmigrated traveler fallbacks", () => {
    for (const path of ["https://other.example/a.png", "data:image/png;base64,a", "//other.example/a", "/api/bootstrap", "/traveler/temporary/v1/idle.webp", "/scenes-other/a"]) {
      expect(assetUrl(path, "https://assets.example.com")).toBe(path);
    }
  });
  it("is idempotent at multiple loading boundaries", () => {
    const resolved = assetUrl("/scenes/test.webp", "https://assets.example.com");
    expect(assetUrl(resolved, "https://assets.example.com")).toBe(resolved);
  });
  it.each(["http://assets.example.com", "https://user:secret@example.com", "https://example.com/prefix", "https://example.com?token=x", "https://example.com#x", "not-a-url"])("rejects an invalid public origin: %s", (base) => {
    expect(() => validateAssetBaseUrl(base)).toThrow("ASSET_BASE_URL");
  });
  it.each(["/scenes/../api/secrets", "/scenes/%2e%2e/x", "/scenes/./a", "/scenes/a\\b", "/scenes/a b"])("rejects a noncanonical mirrored path: %s", (path) => {
    expect(() => assetUrl(path, "https://assets.example.com")).toThrow("canonical public path");
  });
  it("uses only the explicitly exposed build value", () => {
    vi.stubEnv("ASSET_BASE_URL", "https://server-only.example.com");
    vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", "");
    expect(publicAssetUrl("/scenes/a.webp")).toBe("/scenes/a.webp");
    vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", "https://assets.example.com");
    expect(publicAssetUrl("/scenes/a.webp")).toBe("https://assets.example.com/scenes/a.webp");
  });
});
