import { describe, expect, it } from "vitest";
import { parisCountryPackV2 } from "@/content/countries/paris.v2";
import { firstPlaceWithTag, placeTagsOf } from "./places";

describe("semantic place lookup", () => {
  it("finds a place by tag without depending on its position", () => {
    const reordered = {
      ...parisCountryPackV2,
      route: { ...parisCountryPackV2.route, zones: [...parisCountryPackV2.route.zones].reverse() },
    };
    expect(firstPlaceWithTag(reordered, "cafe")?.id).toBe("paris-cafe");
    expect(firstPlaceWithTag(reordered, "landmark")?.id).toBe("paris-landmark");
    expect(firstPlaceWithTag(reordered, "missing")).toBeNull();
  });

  it("retains the legacy kind fallback", () => {
    const zone = { ...parisCountryPackV2.route.zones[0]!, tags: [] };
    expect(placeTagsOf(zone)).toEqual([zone.kind]);
  });
});
