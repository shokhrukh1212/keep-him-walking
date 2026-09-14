import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeasonRequestForm } from "./SeasonRequestForm";

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
});
