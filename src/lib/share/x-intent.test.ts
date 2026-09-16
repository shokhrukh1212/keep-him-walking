import { describe, expect, it } from "vitest";
import { anniversaryShareText, xComposeUrl } from "./x-intent";

describe("Share on X", () => {
  it("encodes the draft and the site address into X's compose intent", () => {
    const href = xComposeUrl("Day 3 of 14 & counting: 100% virtual #walk?");
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("text")).toBe("Day 3 of 14 & counting: 100% virtual #walk?");
    expect(url.searchParams.get("url")).toBe("https://keephimwalking.com");
    expect(href).toContain("text=Day%203%20of%2014%20%26%20counting%3A%20100%25%20virtual%20%23walk%3F");
  });

  it("describes the shared journey without counts or claims about the visitor", () => {
    const texts = [
      anniversaryShareText({ state: "prelaunch" }),
      anniversaryShareText({ state: "live", dayNumber: 3, totalDays: 14, cityName: "Prague" }),
      anniversaryShareText({ state: "completed" }),
    ];
    expect(texts[0]).toContain("starts September 17");
    expect(texts[1]).toBe("Day 3 of 14 on Keep Him Walking: The Anniversary Journey. He's in Prague and only walks while someone is watching.");
    for (const text of texts) {
      expect(text).not.toMatch(/\b(I|I'm|my|me|posted|watchers?|viewers?|people|km|hours?|minutes?)\b/i);
    }
  });
});
