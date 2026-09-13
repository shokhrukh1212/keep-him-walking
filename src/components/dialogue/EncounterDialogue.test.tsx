import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EncounterDialogue } from "./EncounterDialogue";

const line = {
  speaker: "npc" as const,
  mood: "thoughtful" as const,
  text: "Walk beneath the plane trees until the bakery, then turn toward the small green door beside the bookshop and wait by the fountain.",
};

describe("EncounterDialogue", () => {
  it("keeps the speaker and visible caption on the same timeline", () => {
    const { rerender } = render(
      <EncounterDialogue line={line} speakerLabel="Camille" npcSrc="" motionSeconds={0} />,
    );
    expect(screen.getByText("Camille")).toBeInTheDocument();
    const firstCue = screen.getByRole("paragraph").textContent;

    rerender(<EncounterDialogue line={line} speakerLabel="Camille" npcSrc="" motionSeconds={9} />);
    expect(screen.getByText("Camille")).toBeInTheDocument();
    expect(screen.getByRole("paragraph").textContent).not.toBe(firstCue);
  });
});
