import { describe, expect, it } from "vitest";
import { SPONSOR_INQUIRY_COPY, formatLadder, replacementPriceLadder } from "./inquiry";

describe("the proposed sponsorship inquiry", () => {
  it("doubles the price for each replacement", () => {
    expect(replacementPriceLadder(50, 4)).toEqual([50, 100, 200, 400]);
    expect(formatLadder(replacementPriceLadder(50, 4))).toBe("$50 → $100 → $200 → $400…");
    expect(replacementPriceLadder(0, 4)).toEqual([]);
    expect(replacementPriceLadder(50, 0)).toEqual([]);
  });

  it("says the offer is proposed, unpaid and handled on X, with no old season claims", () => {
    const text = Object.values(SPONSOR_INQUIRY_COPY).join(" ");
    expect(text).toContain("Proposed starting price: $50");
    expect(text).toContain("One featured sponsor at a time.");
    expect(text).toContain("full refund");
    expect(text).toContain("not accepting bids or payments");
    expect(text).toContain("No payment or reservation is made here.");
    expect(text).not.toMatch(/\$499|seven days|exclusive|booking closes/i);
  });
});
