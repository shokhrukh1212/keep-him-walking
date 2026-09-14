import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SeasonSponsorView } from "@/lib/contracts";
import { SeasonSponsorLine } from "./SeasonSponsorLine";
import { SeasonSponsorRow } from "./SeasonSponsorRow";

const sponsor: SeasonSponsorView = {
  publicId: "6f1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c",
  seasonNumber: 1,
  name: "Northwind Travel Supplies International Cooperative",
  description: "Lightweight packs for people who walk cities.",
  logoUrl: "https://example.supabase.co/storage/v1/object/public/khw-sponsor-public/logo.webp",
  href: "/r/season-sponsor/6f1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c",
  state: "live",
};

describe("SeasonSponsorLine", () => {
  it("discloses the sponsor with a readable name even when the visible name is truncated", () => {
    render(<SeasonSponsorLine sponsor={sponsor} />);
    const link = screen.getByRole("link", { name: `Season supported by ${sponsor.name}. Opens their website in a new tab.` });
    expect(link).toHaveAttribute("href", sponsor.href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(" ")).toEqual(expect.arrayContaining(["sponsored", "noopener", "noreferrer"]));
    expect(link).toHaveTextContent("Season supported by");
    expect(link.querySelector(".season-sponsor-name")).toHaveTextContent(sponsor.name);
    expect(link.querySelector("img")).toHaveAttribute("alt", "");
  });
});

describe("SeasonSponsorRow", () => {
  it("shows the logo, name, one factual line and a new-tab website link", () => {
    render(<SeasonSponsorRow sponsor={sponsor} />);
    expect(screen.getByText(sponsor.name)).toBeInTheDocument();
    expect(screen.getByText(sponsor.description)).toBeInTheDocument();
    const visit = screen.getByRole("link", { name: `Visit ${sponsor.name}'s website (opens in a new tab)` });
    expect(visit).toHaveTextContent("Visit website");
    expect(visit).toHaveAttribute("target", "_blank");
  });
});
