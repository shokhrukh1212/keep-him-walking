import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeasonRequestForm } from "./SeasonRequestForm";

const SEASON = "6f1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c";
const location = window.location;

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: location });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SeasonRequestForm", () => {
  it("requires separate rights and policy consent with direct policy links", () => {
    render(<SeasonRequestForm seasonId="6f1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c" checkoutEnabled={false} priceCents={49_900} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => box.hasAttribute("required"))).toBe(true);
    expect(screen.getByRole("link", { name: "Sponsor Terms" })).toHaveAttribute("href", "/sponsor-terms");
    expect(screen.getByRole("link", { name: "Content & Listing Moderation Policy" })).toHaveAttribute("href", "/content-moderation");
    expect(screen.getByText(/I confirm I have the right/)).toBeInTheDocument();
  });

  it("names the checkout price on the button while checkout is open", () => {
    render(<SeasonRequestForm seasonId={SEASON} checkoutEnabled priceCents={10_000} />);
    expect(screen.getByRole("button", { name: "Continue to checkout · USD 100.00" })).toBeInTheDocument();
    expect(screen.getByText(/straight to secure checkout at USD 100.00/)).toBeInTheDocument();
  });

  it("goes to the provider's checkout the server returns, without naming a price itself", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ statusUrl: "/sponsors/request/abc", checkoutUrl: "https://checkout.dodopayments.com/s/1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<SeasonRequestForm seasonId={SEASON} checkoutEnabled priceCents={10_000} />);
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.dodopayments.com/s/1"));
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("seasonId")).toBe(SEASON);
    expect([...body.keys()]).not.toContain("priceCents");
    expect(screen.getByTestId("season-checkout-redirect")).toBeInTheDocument();
  });

  it("keeps the private link and charges nothing when checkout cannot be opened", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ statusUrl: "/sponsors/request/abc", checkoutUrl: null }),
    }));
    const { container } = render(<SeasonRequestForm seasonId={SEASON} checkoutEnabled priceCents={10_000} />);
    fireEvent.submit(container.querySelector("form")!);

    const sent = await screen.findByTestId("season-request-sent");
    expect(sent).toHaveTextContent(/Nothing has been charged/);
    expect(screen.getByRole("link", { name: "/sponsors/request/abc" })).toBeInTheDocument();
  });
});
