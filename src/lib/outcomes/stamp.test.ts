import { describe, expect, it } from "vitest";
import { stampFor, stampLabel } from "./stamp";

describe("stampFor", () => {
  it("gives a marathon the gold stamp", () => {
    expect(stampFor({ outcome: { marathon: true, landmarkReached: true }, status: "completed" })).toBe("gold");
  });

  it("gives a marathon gold even when the landmark was missed", () => {
    expect(stampFor({ outcome: { marathon: true, landmarkReached: false }, status: "completed" })).toBe("gold");
  });

  it("gives a reached landmark the colour stamp", () => {
    expect(stampFor({ outcome: { marathon: false, landmarkReached: true }, status: "completed" })).toBe("colour");
  });

  it("gives a day that fell short the grey stamp", () => {
    expect(stampFor({ outcome: { marathon: false, landmarkReached: false }, status: "completed" })).toBe("grey");
  });

  it("marks the live day as current rather than judging it early", () => {
    expect(stampFor({ outcome: null, status: "live" })).toBe("current");
    expect(stampFor({ outcome: { marathon: false, landmarkReached: false }, status: "live" })).toBe("current");
  });

  it("refuses to invent a colour for a day the server has not finalized", () => {
    expect(stampFor({ outcome: null, status: "completed" })).toBeNull();
  });
});

describe("stampLabel", () => {
  it("names every stamp", () => {
    expect(stampLabel("gold")).toBe("MARATHON");
    expect(stampLabel("colour")).toBe("LANDMARK REACHED");
    expect(stampLabel("grey")).toBe("UNFINISHED");
    expect(stampLabel("current")).toBe("WALKING NOW");
  });

  it("says plainly that an unfinalized day has no stamp", () => {
    expect(stampLabel(null)).toBe("NOT YET STAMPED");
  });
});
