import { describe, expect, it } from "vitest";
import { tashkentCountryPackV5 } from "@/content/countries/tashkent.v5";
import { ballotPrewarmPackIds, packPrewarmPaths, prewarmUrl } from "./prewarm";

describe("launch prewarming", () => {
  it("collects public pack assets without collecting research URLs", () => {
    const paths = packPrewarmPaths(tashkentCountryPackV5);
    expect(paths).toContain("/scenes/tashkent/v4/zones/arrival-boulevard/fallback.webp");
    expect(paths).toContain("/postcards/tashkent/v4/background.webp");
    expect(paths.some((path) => path.startsWith("https://"))).toBe(false);
  });

  it("uses the fixed onward pack after the name vote and every candidate thereafter", () => {
    expect(ballotPrewarmPackIds("name", [])).toEqual(["dushanbe-v1"]);
    expect(ballotPrewarmPackIds("destination", [{ pack_id: "a-v1" }, { pack_id: "a-v1" }, { pack_id: "b-v1" }]))
      .toEqual(["a-v1", "b-v1"]);
  });

  it("keeps postcards on the app while mirrored trees use the asset origin", () => {
    expect(prewarmUrl("/audio/a.wav", "https://assets.example.com", "https://app.example.com"))
      .toBe("https://assets.example.com/audio/a.wav");
    expect(prewarmUrl("/postcards/a.webp", "https://assets.example.com", "https://app.example.com"))
      .toBe("https://app.example.com/postcards/a.webp");
  });
});
