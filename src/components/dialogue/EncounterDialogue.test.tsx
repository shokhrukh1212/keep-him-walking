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

  it("marks his waiting line as his own words rather than a local encounter", () => {
    const { container, rerender } = render(
      <EncounterDialogue
        line={{ speaker: "traveler", text: "I only walk while someone is watching.", mood: "neutral" }}
        speakerLabel="Milo"
        npcSrc="/npcs/neutral.webp"
        showNpcImage={false}
        kind="waiting"
      />,
    );
    expect(screen.getByText("I only walk while someone is watching.")).toBeInTheDocument();
    expect(container.querySelector(".dialogue-bubble")).toHaveAttribute("data-dialogue", "waiting");
    // No resident is speaking to him, so no portrait is drawn beside it.
    expect(container.querySelector(".npc-wrap")).not.toBeInTheDocument();
    rerender(
      <EncounterDialogue
        line={{ speaker: "npc", text: "Bonjour.", mood: "neutral" }}
        speakerLabel="Camille"
        npcSrc="/npcs/neutral.webp"
      />,
    );
    expect(container.querySelector(".dialogue-bubble")).toHaveAttribute("data-dialogue", "encounter");
  });
});
