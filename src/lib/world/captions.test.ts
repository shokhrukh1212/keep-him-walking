import { describe, expect, it } from "vitest";
import { captionCueAt, captionCues, readableLineSeconds } from "./captions";

const longLine = {
  speaker: "npc" as const,
  mood: "thoughtful" as const,
  text: "Walk beneath the plane trees until the bakery, then turn toward the small green door beside the bookshop and wait by the fountain.",
};

describe("conversation captions", () => {
  it("splits long authored lines without dropping or rewriting words", () => {
    const cues = captionCues(longLine.text);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues.join(" ")).toBe(longLine.text);
    expect(cues.every((cue) => cue.length <= 84)).toBe(true);
  });

  it("selects a cue from the line timeline and holds the final cue", () => {
    const duration = readableLineSeconds(longLine);
    expect(captionCueAt(longLine, 0)).toBe(captionCues(longLine.text)[0]);
    expect(captionCueAt(longLine, duration - 0.01)).toBe(captionCues(longLine.text).at(-1));
  });

  it("extends a long line beyond the default readable hold", () => {
    expect(readableLineSeconds(longLine)).toBeGreaterThan(4.5);
    expect(readableLineSeconds({ ...longLine, text: "Merci." })).toBe(4.5);
  });
});
