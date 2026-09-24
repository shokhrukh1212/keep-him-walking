import { describe, expect, it } from "vitest";
import { launchCelebrationAt, prelaunchStartLine } from "./celebration";

const launch = "2026-09-24T17:00:00Z";

describe("Paris launch announcement", () => {
  it("names the server's 17:00 UTC start as 19:00 in France on launch day", () => {
    const result = launchCelebrationAt(launch, Date.parse("2026-09-24T12:00:00Z"), "Europe/Paris");
    expect(result).toEqual({
      localTime: "7:00 PM", utcTime: "5:00 PM",
      shareText: "Milo starts walking in Paris today at 7:00 PM France time (5:00 PM UTC). Come watch and support his journey!",
    });
    expect(prelaunchStartLine(launch, "Europe/Paris")).toBe("Milo starts walking in Paris on Thursday, September 24 at 7:00 PM France time.");
  });

  it("never says today on a different local day or after the start", () => {
    expect(launchCelebrationAt(launch, Date.parse("2026-09-23T21:00:00Z"), "Europe/Paris")).toBeNull();
    expect(launchCelebrationAt(launch, Date.parse(launch), "Europe/Paris")).toBeNull();
    expect(prelaunchStartLine(null, "Europe/Paris")).toBe("Milo is getting ready for his first walk.");
  });
});
