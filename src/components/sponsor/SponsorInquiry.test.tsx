import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SponsorInquiry } from "./SponsorInquiry";

describe("SponsorInquiry", () => {
  it("offers a disabled checkout beside an active X link and takes nothing", () => {
    const { container } = render(<SponsorInquiry xUrl="https://x.com/shokhkarim1212" />);
    expect(screen.getByText("Feature your product on the journey")).toBeInTheDocument();
    expect(screen.getByText("Proposed starting price: $50")).toBeInTheDocument();
    expect(screen.getByText("One featured sponsor at a time.")).toBeInTheDocument();
    const checkout = screen.getByRole("button", { name: "Checkout unavailable" });
    expect(checkout).toBeDisabled();
    expect(checkout).toHaveAccessibleDescription("Awaiting payment-provider approval.");
    const x = screen.getByRole("link", { name: /Message me on X/ });
    expect(x).toHaveAttribute("href", "https://x.com/shokhkarim1212");
    expect(x).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Message me to discuss sponsorship. No payment or reservation is made here.")).toBeInTheDocument();
    expect(container.querySelector("form, input, textarea")).toBeNull();
    expect(container.textContent).not.toMatch(/\$499|seven days|booking closes/i);
  });

  it("still says no payment is taken when no X profile is configured", () => {
    render(<SponsorInquiry xUrl={null} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
  });
});
