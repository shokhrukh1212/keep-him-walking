import { describe, expect, it } from "vitest";
import { tashkentCountryPack } from "@/content/countries/tashkent.v1";
import { countryPackSchema } from "./schema";

describe("Tashkent content pack", () => {
  it("satisfies the production-compatible asset contract", () => {
    expect(countryPackSchema.parse(tashkentCountryPack).assetVersion).toBe("tashkent-v1");
    expect(tashkentCountryPack.scene.layers).toHaveLength(4);
    expect(tashkentCountryPack.ambientActions).toHaveLength(4);
    expect(tashkentCountryPack.encounters[0]?.lines).toHaveLength(4);
  });

  it("keeps dialogue outside animation files", () => {
    expect(tashkentCountryPack.encounters[0]?.lines.every((line) => line.text.length > 0)).toBe(true);
    expect(tashkentCountryPack.traveler.riveUrl).toBeNull();
  });
});
