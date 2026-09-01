import { describe, expect, it } from "vitest";
import { tashkentCountryPackV3 } from "@/content/countries/tashkent.v3";
import { countryPackSchema } from "./schema";

describe("Tashkent content pack", () => {
  it("satisfies the production-compatible asset contract", () => {
    expect(countryPackSchema.parse(tashkentCountryPackV3).assetVersion).toBe("tashkent-v3");
    expect(tashkentCountryPackV3.route.zones).toHaveLength(5);
    expect(tashkentCountryPackV3.route.zones.every((zone) => zone.layers.length >= 2)).toBe(true);
    expect(tashkentCountryPackV3.route.zones.every((zone) => zone.props.every((prop) => prop.assetUrl))).toBe(true);
    expect(tashkentCountryPackV3.ambientActions).toHaveLength(4);
    expect(tashkentCountryPackV3.encounters[0]?.lines).toHaveLength(4);
  });

  it("keeps dialogue outside animation files", () => {
    expect(tashkentCountryPackV3.encounters[0]?.lines.every((line) => line.text.length > 0)).toBe(true);
    expect(tashkentCountryPackV3.traveler.riveUrl).toBeNull();
    expect(tashkentCountryPackV3.traveler.walkCycle?.frames).toHaveLength(8);
  });
});
