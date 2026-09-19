import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SponsorPlace } from "@/lib/sponsors/places";
import { SponsorPlacePanel } from "./SponsorPlacePanel";

const place: SponsorPlace = {
  slotId: "00000000-0000-4000-8000-000000000001",
  tier: "regular",
  position: 1,
  priceCents: 5_000,
  currency: "USD",
  state: "available",
  placement: null,
};

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:logo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SponsorPlacePanel purchase form", () => {
  it("always fills the square and explains each checkout blocker", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SponsorPlacePanel place={place} checkoutEnabled={false} durationCopy="Visible for the journey." onCheckout={vi.fn()} />);

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("Logo fit")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "example.com" } });
    fireEvent.change(screen.getByLabelText(/Product logo/), {
      target: { files: [new File(["logo"], "logo.png", { type: "image/png" })] },
    });
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Example" } });
    fireEvent.change(screen.getByLabelText("Short description"), { target: { value: "A useful product." } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout · $50" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Check the rights and policies box");

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout · $50" }));
    expect(screen.getByRole("alert")).toHaveTextContent("payment provider has not approved");
    expect(screen.getByRole("alert")).toHaveTextContent("not been charged");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByAltText("Logo preview")).toHaveAttribute("data-fit", "crop");
  });
});
