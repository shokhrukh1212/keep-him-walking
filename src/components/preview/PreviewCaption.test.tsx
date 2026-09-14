import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PreviewCaptionSnapshot } from "@/lib/preview/controller";
import { PreviewCaption } from "./PreviewCaption";

const speaking: PreviewCaptionSnapshot = {
  speaking: true,
  lineId: "one-bag",
  lineText: "Seven cities, one bag. I may have overpacked.",
  cueIndex: 0,
  cueText: "Seven cities, one bag. I may have overpacked.",
  sequence: 6,
};
const idle: PreviewCaptionSnapshot = { speaking: false, lineId: null, lineText: null, cueIndex: 0, cueText: null, sequence: 6 };

describe("PreviewCaption", () => {
  it("shows the cue only while he speaks, and keeps its band when he stops", () => {
    const { rerender } = render(<PreviewCaption caption={speaking} reducedMotion={false} />);
    expect(screen.getByTestId("preview-caption")).toHaveAttribute("data-speaking", "true");
    expect(screen.getByTestId("preview-caption")).toHaveTextContent("Seven cities, one bag. I may have overpacked.");
    rerender(<PreviewCaption caption={idle} reducedMotion={false} />);
    expect(screen.getByTestId("preview-caption-band")).toBeInTheDocument();
    expect(screen.getByTestId("preview-caption")).toHaveAttribute("data-speaking", "false");
    expect(screen.getByTestId("preview-caption").textContent).toBe("");
  });

  it("takes no focus and is not announced cue by cue", () => {
    render(<PreviewCaption caption={speaking} reducedMotion />);
    const band = screen.getByTestId("preview-caption-band");
    expect(band).toHaveAttribute("aria-hidden", "true");
    expect(band.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
    expect(band.querySelector("[aria-live], [role]")).toBeNull();
    expect(screen.getByTestId("preview-caption")).toHaveAttribute("data-motion", "reduced");
  });
});
