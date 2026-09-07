import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import {
  frameIndexForState,
  sourceForFrame,
  SpriteTravelerRenderer,
} from "./SpriteTravelerRenderer";

const command = {
  state: "walk" as const,
  mood: "neutral" as const,
  facing: "right" as const,
  walkingSpeed: 1,
  walking: true,
  routeRuntime: {
    globalActiveSeconds: 20,
    authoritativeAt: new Date().toISOString(),
    walking: true,
  },
  motionSampleUntilMs: Number.POSITIVE_INFINITY,
  reducedMotion: false,
  sponsorPatchUrl: "/test-sponsored-patch.webp",
};

describe("SpriteTravelerRenderer", () => {
  it("attaches sponsor art separately from the fixed traveler canvas", () => {
    const { container } = render(
      <SpriteTravelerRenderer command={command} pack={tashkentCountryPackV4} onReady={vi.fn()} />,
    );
    expect(container.querySelector(".traveler-sponsor-patch"))
      .toHaveAttribute("src", command.sponsorPatchUrl);
    expect(container.querySelector("canvas.traveler-frame")).toHaveAttribute("width", "540");
    expect(container.querySelector("canvas.traveler-frame")).toHaveAttribute("height", "960");
  });

  it("keeps the current-state fallback visible until every source sheet is decoded", () => {
    const { container } = render(
      <SpriteTravelerRenderer command={command} pack={tashkentCountryPackV4} onReady={vi.fn()} />,
    );
    expect(container.querySelector(".traveler-fallback-frame"))
      .toHaveAttribute("data-visible", "true");
    expect(container.querySelector(".traveler-fallback-frame"))
      .toHaveAttribute("src", expect.stringContaining("walk-1.webp"));
  });

  it("maps the production frames to stable source-sheet cells", () => {
    expect(sourceForFrame("/traveler/production/v2/walk/walk-6.webp"))
      .toEqual({ sheet: "walk", index: 5 });
    expect(sourceForFrame("/traveler/production/v2/actions/drink.webp"))
      .toEqual({ sheet: "transition", index: 3 });
    expect(sourceForFrame("/traveler/production/v2/actions/photo.webp"))
      .toEqual({ sheet: "action", index: 7 });
  });

  it("selects each of the six approved gait cells from shared clock phases", () => {
    const manifest = tashkentCountryPackV4.traveler.spriteManifest!;
    expect(Array.from({ length: 6 }, (_, gaitFrame) => frameIndexForState(
      "walk",
      manifest,
      gaitFrame,
      0,
    ))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("does not replace active walking with a static pose for reduced motion", () => {
    const { container } = render(
      <SpriteTravelerRenderer
        command={{ ...command, reducedMotion: true }}
        pack={tashkentCountryPackV4}
        onReady={vi.fn()}
      />,
    );
    expect(container.querySelector(".traveler-sprite")).toHaveAttribute("data-state", "walk");
    expect(container.querySelector(".traveler-sprite")).toHaveAttribute("data-walking", "true");
  });
});
