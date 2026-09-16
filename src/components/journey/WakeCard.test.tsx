import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WakeCard } from "./WakeCard";

describe("WakeCard", () => {
  it("keeps the confirmed wake facts and offers an X draft the visitor posts themselves", () => {
    render(
      <WakeCard
        cityName="Baku"
        localTime="04:12"
        waitedDuration="2h 41m"
        shareText="Day 3 of 14 on Keep Him Walking: The Anniversary Journey."
      />,
    );
    expect(screen.getByLabelText("You woke him up")).toHaveTextContent(
      "You found him waiting in Baku at 04:12. He had waited 2h 41m.",
    );
    const share = screen.getByRole("link", { name: "Share on X" });
    expect(share).toHaveAttribute("target", "_blank");
    expect(new URL(share.getAttribute("href")!).searchParams.get("url")).toBe("https://keephimwalking.com");
  });
});
