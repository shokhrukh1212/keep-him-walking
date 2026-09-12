import { describe, expect, it } from "vitest";
import { parisCountryPackV2 } from "@/content/countries/paris.v2";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { stageLayout } from "./stage-layout";
import { DEFAULT_CHARACTER_HEIGHT_TARGETS } from "./stage-targets";
import {
  chooseGround,
  choosePainting,
  chooseSky,
  decodedBytes,
  placeLoadPlan,
  placeRenditions,
  shouldReplaceRendition,
  type RenditionRequest,
} from "./scene-assets";

const cafe = parisCountryPackV2.route.zones.find((zone) => zone.id === "paris-cafe")!;
const landmark = parisCountryPackV2.route.zones.find((zone) => zone.id === "paris-landmark")!;

function request(width: number, height: number, resolution: number): RenditionRequest {
  const layout = stageLayout(width, height, 3_600, 1_200, cafe.stage, DEFAULT_CHARACTER_HEIGHT_TARGETS);
  return {
    viewportWidth: width,
    viewportHeight: height,
    resolution,
    imageScale: layout.imageScale,
    groundHeightPx: Math.max(height - layout.groundY, height * 0.18),
  };
}

describe("rendition choice", () => {
  it("gives a portrait phone the centre of the painting, not its edges", () => {
    const phone = placeRenditions(cafe, request(390, 844, 1));
    expect(phone.city).toMatchObject({ crop: "center", width: 800, nominalLeft: 1_200, nominalWidth: 1_200 });
    const tablet = placeRenditions(cafe, request(768, 1_024, 1.25));
    expect(tablet.city).toMatchObject({ crop: "center", width: 1_200 });
  });

  it("gives a landscape screen only as many pixels as it draws", () => {
    expect(placeRenditions(cafe, request(1_366, 768, 1)).city).toMatchObject({ crop: "full", width: 2_560 });
    // 1440 × 900 draws the painting 964 px tall: 2560 would be a 13% upscale.
    expect(placeRenditions(cafe, request(1_440, 900, 1)).city).toMatchObject({ crop: "full", width: 3_600 });
    expect(placeRenditions(cafe, request(844, 390, 1)).city).toMatchObject({ crop: "full", width: 1_920 });
  });

  it("cuts decoded texture memory for phones by more than half", () => {
    const phone = placeRenditions(landmark, request(390, 844, 1));
    const desktop = placeRenditions(landmark, request(1_920, 1_080, 1.6));
    const phoneBytes = decodedBytes([phone.city, phone.sky, phone.ground, phone.night]);
    const desktopBytes = decodedBytes([desktop.city, desktop.sky, desktop.ground, desktop.night]);
    expect(phoneBytes).toBeLessThan(desktopBytes / 2);
  });

  it("respects the GPU texture limit and softer layers", () => {
    const limited = choosePainting(cafe.variants!.city, 3_600, 1_200, { ...request(1_440, 900, 1.6), maxTextureSize: 2_560 });
    expect(limited?.width).toBe(2_560);
    expect(chooseSky(cafe.variants!.sky, request(390, 844, 1))?.width).toBe(800);
    expect(chooseSky(cafe.variants!.sky, request(1_920, 1_080, 1.6))?.width).toBe(1_600);
    expect(chooseGround(cafe.variants!.ground, request(1_440, 900, 1))?.width).toBe(3_600);
    expect(chooseGround(cafe.variants!.ground, { ...request(1_440, 900, 1), groundHeightPx: 60 })?.width).toBe(1_800);
  });

  it("keeps older packs on their single painting", () => {
    const legacy = placeRenditions(tashkentCountryPackV4.route.zones[0]!, request(1_440, 900, 1));
    expect(legacy).toMatchObject({ nominal: null, city: { url: tashkentCountryPackV4.route.zones[0]!.fallbackUrl, width: 0 } });
  });

  it("upgrades on resize but never swaps down mid-visit", () => {
    const small = placeRenditions(cafe, request(390, 844, 1)).city;
    const large = placeRenditions(cafe, request(1_440, 900, 1.6)).city;
    expect(shouldReplaceRendition(small, large)).toBe(true);
    expect(shouldReplaceRendition(large, small)).toBe(false);
    expect(shouldReplaceRendition(large, large)).toBe(false);
    expect(shouldReplaceRendition(null, small)).toBe(true);
  });
});

describe("place load plan", () => {
  it("holds only the current place until the next is about to appear", () => {
    expect(placeLoadPlan({ zoneIndex: 2, nextZoneIndex: 3, secondsToNextVisit: 300 })).toEqual({ current: 2, next: null });
    expect(placeLoadPlan({ zoneIndex: 2, nextZoneIndex: 3, secondsToNextVisit: 45 })).toEqual({ current: 2, next: 3 });
    expect(placeLoadPlan({ zoneIndex: 0, nextZoneIndex: 0, secondsToNextVisit: 5 })).toEqual({ current: 0, next: null });
  });
});
