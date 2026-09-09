import { describe, expect, it } from "vitest";
import { CHARACTER_MANIFEST, CLIP_SPECS, clipFallbackChain, normalizedClipName } from "./manifest";

describe("character clip manifest", () => {
  it("normalizes source aliases independent of punctuation and case", () => {
    expect(normalizedClipName("Walking Brisk.001")).toBe("walkingbrisk001");
    expect(CLIP_SPECS.walk_brisk.aliases.map(normalizedClipName)).toContain("walkingbrisk");
  });

  it("provides an acyclic fallback from every optional take to the v2 core", () => {
    for (const clip of Object.keys(CLIP_SPECS) as Array<keyof typeof CLIP_SPECS>) {
      const chain = clipFallbackChain(clip);
      expect(new Set(chain).size).toBe(chain.length);
      expect(["idle", "walk"]).toContain(chain.at(-1));
    }
  });

  it("prefers drop-in v3 traveler assets while retaining the reviewed v2 model", () => {
    expect(CHARACTER_MANIFEST.traveler).toMatchObject({
      url: "/characters/v3/traveler.glb",
      animationUrl: "/characters/v3/traveler-animations.glb",
      fallbackUrl: "/characters/v2/traveler.glb?rev=interactions-1",
    });
  });
});
