import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalFooter } from "./LegalFooter";

describe("LegalFooter", () => {
  it("keeps the free-launch legal and support links", () => {
    render(<LegalFooter />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.queryByRole("link", { name: "Refunds & cancellation" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sponsor terms" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Content moderation" })).toBeNull();
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/faq");
    expect(screen.getByRole("link", { name: "Contact & support" })).toHaveAttribute("href", "/contact");
  });
});
