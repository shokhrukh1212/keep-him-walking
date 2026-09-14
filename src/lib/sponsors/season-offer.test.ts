import { describe, expect, it } from "vitest";
import {
  SEASON_OFFER_COPY,
  earliestEligibleSeason,
  formatSeasonInstant,
  formatUsdCents,
  saleClosesAt,
  seasonOfferHeadline,
  seasonTaxNote,
  type OfferSeason,
} from "./season-offer";

const DAY = 86_400_000;
const first = Date.parse("2026-09-23T16:00:00Z");

function season(number: number, startMs: number, status = "draft"): OfferSeason {
  return {
    id: `j${number}`,
    number,
    title: `Season ${number}`,
    status,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(startMs + 7 * DAY).toISOString(),
    cities: ["Paris"],
  };
}

describe("earliest eligible season", () => {
  const one = season(1, first);
  const two = season(2, first + 7 * DAY);

  it("offers the earliest unbooked future season, not a calendar", () => {
    expect(earliestEligibleSeason([two, one], new Set(), first - 3 * DAY, 24)).toBe(one);
  });

  it("offers the next season once the earlier one is paid for", () => {
    expect(earliestEligibleSeason([one, two], new Set(["j1"]), first - 3 * DAY, 24)).toBe(two);
  });

  it("never sells a season that started unsponsored, or inside the 24-hour cutoff", () => {
    expect(earliestEligibleSeason([{ ...one, status: "active" }, two], new Set(), first + DAY, 24)).toBe(two);
    expect(earliestEligibleSeason([one], new Set(), first - DAY, 24)).toBeNull();
    expect(earliestEligibleSeason([one], new Set(), first - DAY - 1, 24)).toBe(one);
    expect(earliestEligibleSeason([one], new Set(), first - 2 * DAY, 72)).toBeNull();
  });

  it("offers nothing when no future season is configured", () => {
    expect(earliestEligibleSeason([{ ...one, status: "completed" }], new Set(), first + 8 * DAY, 24)).toBeNull();
    expect(earliestEligibleSeason([], new Set(), first, 24)).toBeNull();
  });
});

describe("offer wording", () => {
  it("keeps the approved copy exactly", () => {
    expect(SEASON_OFFER_COPY.headline).toBe("One sponsor. Seven days. $499.");
    expect(SEASON_OFFER_COPY.body).toContain("Audience size and results are not guaranteed.");
    expect(SEASON_OFFER_COPY.body).toContain("One-time payment; no renewal.");
  });

  it("prints exact UTC dates, the cutoff and the price", () => {
    expect(formatSeasonInstant("2026-09-23T16:00:00Z")).toBe("Wed 23 Sep 2026, 16:00 UTC");
    expect(saleClosesAt("2026-09-23T16:00:00Z", 24)).toBe("2026-09-22T16:00:00.000Z");
    expect(formatUsdCents()).toBe("USD 499.00");
    expect(formatUsdCents(59_900)).toBe("USD 599.00");
    expect(seasonOfferHeadline(69_900)).toBe("One sponsor. Seven days. $699.");
  });

  it("never claims the price includes tax unless configured so", () => {
    expect(seasonTaxNote(false)).toContain("before tax");
    expect(seasonTaxNote(false)).toContain("shown at checkout before you pay");
    expect(seasonTaxNote(true)).toBe("USD 499.00 includes any tax the payment processor collects.");
    expect(seasonTaxNote(true, 59_900)).toBe("USD 599.00 includes any tax the payment processor collects.");
  });
});
