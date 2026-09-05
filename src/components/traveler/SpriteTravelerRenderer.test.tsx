import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { SpriteTravelerRenderer } from "./SpriteTravelerRenderer";

const command = {
  state: "walk" as const,
  mood: "neutral" as const,
  facing: "right" as const,
  walkingSpeed: 1,
  reducedMotion: false,
  sponsorPatchUrl: "/test-sponsored-patch.webp",
};

describe("SpriteTravelerRenderer", () => {
  it("attaches sponsor art as a separate transform layer", () => {
    const { container } = render(<SpriteTravelerRenderer command={command} pack={tashkentCountryPackV4} onReady={vi.fn()} />);
    expect(container.querySelector(".traveler-sponsor-patch")).toHaveAttribute("src", command.sponsorPatchUrl);
    expect(container.querySelector(".traveler-frame")).not.toHaveAttribute("src", command.sponsorPatchUrl);
  });

  it("falls back to a valid idle sprite after a missing frame", () => {
    const { container } = render(<SpriteTravelerRenderer command={command} pack={tashkentCountryPackV4} onReady={vi.fn()} />);
    const frame = container.querySelector(".traveler-frame") as HTMLImageElement;
    fireEvent.error(frame);
    expect(frame.src).toContain("/traveler/production/v2/actions/idle.webp");
  });

  it("advances through distinct production frames while the HUD state is walking", () => {
    vi.useFakeTimers();
    const { container } = render(<SpriteTravelerRenderer command={command} pack={tashkentCountryPackV4} onReady={vi.fn()} />);
    const frame = container.querySelector(".traveler-frame") as HTMLImageElement;
    const initialSrc = frame.getAttribute("src");
    act(() => vi.advanceTimersByTime(125));
    expect(frame.getAttribute("src")).not.toBe(initialSrc);
    expect(frame.getAttribute("src")).toContain("/traveler/production/v2/walk/");
    vi.useRealTimers();
  });

  it("uses a stopped composition for reduced motion", () => {
    const { container } = render(<SpriteTravelerRenderer command={{ ...command, reducedMotion: true }} pack={tashkentCountryPackV4} onReady={vi.fn()} />);
    expect(container.querySelector(".traveler-frame")).toHaveAttribute("src", expect.stringContaining("stop.webp"));
  });
});
