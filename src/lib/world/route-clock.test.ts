import { describe, expect, it } from "vitest";
import { tashkentCountryPackV3 as tashkentCountryPackV2 } from "@/content/countries/tashkent.v3";
import { deterministicVariant, extrapolatedRouteSeconds, routePositionAt } from "./route-clock";

describe("route clock", () => {
  it("moves through all five zones on active-viewer time", () => {
    expect(routePositionAt(tashkentCountryPackV2, 0).zoneId).toBe("arrival-boulevard");
    expect(routePositionAt(tashkentCountryPackV2, 121).zoneId).toBe("mahalla-street");
    expect(routePositionAt(tashkentCountryPackV2, 241).zoneId).toBe("chorsu-market");
    expect(routePositionAt(tashkentCountryPackV2, 361).zoneId).toBe("plov-cafe");
    expect(routePositionAt(tashkentCountryPackV2, 481).zoneId).toBe("evening-landmark");
  });

  it("freezes when no watcher is active and caps disconnected extrapolation", () => {
    const paused = { globalActiveSeconds: 50, authoritativeAt: "2026-09-01T00:00:00Z", walking: false };
    const walking = { ...paused, walking: true };
    const later = new Date("2026-09-01T00:01:00Z").getTime();
    expect(extrapolatedRouteSeconds(paused, later)).toBe(50);
    expect(extrapolatedRouteSeconds(walking, later)).toBe(80);
  });

  it("selects segment variants deterministically", () => {
    expect(deterministicVariant("zone:ground", 24, 2)).toBe(
      deterministicVariant("zone:ground", 24, 2),
    );
  });
});
