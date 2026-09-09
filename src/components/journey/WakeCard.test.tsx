import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WakeCard } from "./WakeCard";

describe("WakeCard", () => {
  it("keeps the confirmed wake facts and shares only on request", () => {
    const onShare = vi.fn();
    render(
      <WakeCard
        cityName="Baku"
        localTime="04:12"
        waitedDuration="2h 41m"
        onShare={onShare}
      />,
    );
    expect(screen.getByLabelText("You woke him up")).toHaveTextContent(
      "You found him waiting in Baku at 04:12. He had waited 2h 41m.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(onShare).toHaveBeenCalledOnce();
  });
});
