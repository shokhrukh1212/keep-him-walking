import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SeasonOffer } from "@/lib/sponsors/season-data";
import { SeasonOfferDetails, SeasonSponsorOffer } from "./SeasonSponsorOffer";

const offer: SeasonOffer = {
  season: {
    id: "6f1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c",
    number: 2,
    title: "Season 2",
    startsAt: "2026-09-30T16:00:00.000Z",
    endsAt: "2026-10-07T16:00:00.000Z",
    saleClosesAt: "2026-09-29T16:00:00.000Z",
    cities: ["Paris", "Prague"],
  },
  priceCents: 10_000,
  currency: "USD",
  priceIncludesTax: false,
  cutoffHours: 24,
  checkout: "request_only",
  pricing: [
    { number: 1, priceCents: 5_000, startsAt: null, endsAt: null },
    { number: 2, priceCents: 10_000, startsAt: "2026-09-30T16:00:00.000Z", endsAt: "2026-10-07T16:00:00.000Z" },
    { number: 3, priceCents: 5_000, startsAt: null, endsAt: null },
  ],
  ownerXUrl: "https://x.com/keephimwalking",
  currentSponsor: { name: "Acme", seasonNumber: 1, priceCents: 5_000 },
};

afterEach(() => vi.unstubAllGlobals());

describe("SeasonOfferDetails", () => {
  it("shows exact UTC dates, the price, tax handling and a request (not a purchase) while checkout is closed", () => {
    render(<SeasonOfferDetails offer={offer} />);
    expect(screen.getByText("Season 1 is supported by Acme.")).toBeInTheDocument();
    expect(screen.getByText("Wed 30 Sep 2026, 16:00 UTC")).toBeInTheDocument();
    expect(screen.getByText("Wed 7 Oct 2026, 16:00 UTC")).toBeInTheDocument();
    expect(screen.getByText("Tue 29 Sep 2026, 16:00 UTC")).toBeInTheDocument();
    expect(screen.getByText("USD 100.00, one time")).toBeInTheDocument();
    expect(screen.getByText(/before tax/)).toBeInTheDocument();
    expect(screen.getByText(/does not reserve the season/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request this season" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /Message me on X/ })).toHaveAttribute("href", "https://x.com/keephimwalking");
  });

  it("sends the visitor straight to checkout and hides the secondary contact when checkout is enabled", () => {
    render(<SeasonOfferDetails offer={{ ...offer, checkout: "enabled", currentSponsor: null }} />);
    expect(screen.getByRole("link", { name: "Sponsor this season" })).toBeInTheDocument();
    expect(screen.getByText(/continue straight to checkout/)).toBeInTheDocument();
    expect(screen.queryByText(/does not reserve the season/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Message me on X/ })).toBeNull();
  });

  it("offers nothing, honestly, when no season is open", () => {
    render(<SeasonOfferDetails offer={{ ...offer, season: null }} />);
    expect(screen.getByText(/No season is open for sponsorship right now/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /this season/ })).toBeNull();
  });
});

describe("SeasonSponsorOffer", () => {
  it("keeps the approved copy and loads the offer only when shown", async () => {
    const fetchMock = vi.fn(async () => Response.json(offer));
    vi.stubGlobal("fetch", fetchMock);
    render(<SeasonSponsorOffer />);
    expect(screen.getByText("Feature your product on the journey.")).toBeInTheDocument();
    expect(screen.getByText("One featured sponsor. $50 to begin.")).toBeInTheDocument();
    expect(screen.getByText(/Audience size and results are not guaranteed\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("season-offer-facts")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/season-sponsor/offer", expect.anything());
  });

  it("points to the public offer page when the dates cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    render(<SeasonSponsorOffer />);
    await waitFor(() => expect(screen.getByRole("link", { name: "keephimwalking.com/sponsors" })).toBeInTheDocument());
  });
});
