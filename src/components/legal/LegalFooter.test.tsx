import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalFooter } from "./LegalFooter";

describe("LegalFooter", () => {
  it("links directly to every public policy and support route", () => {
    render(<LegalFooter />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Refunds & cancellation" })).toHaveAttribute("href", "/refund-policy");
    expect(screen.getByRole("link", { name: "Sponsor terms" })).toHaveAttribute("href", "/sponsor-terms");
    expect(screen.getByRole("link", { name: "Content moderation" })).toHaveAttribute("href", "/content-moderation");
    expect(screen.getByRole("link", { name: "Contact & support" })).toHaveAttribute("href", "/contact");
  });
});
