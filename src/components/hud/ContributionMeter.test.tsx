import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContributionMeter, formatWatchingTime } from "./ContributionMeter";

describe("ContributionMeter", () => {
  it("formats only server-confirmed watching time", () => {
    expect(formatWatchingTime(125.9)).toBe("2m 05s");
    render(<ContributionMeter seconds={125.9} status="confirmed" />);
    expect(screen.getByText("2m 05s")).toBeInTheDocument();
    expect(screen.getByText("watching today · server confirmed")).toBeInTheDocument();
    expect(screen.queryByText(/steps/i)).not.toBeInTheDocument();
  });

  it("does not invent zero while waiting for confirmation", () => {
    render(<ContributionMeter seconds={null} status="pending" />);
    expect(screen.getByText("Confirming…")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the first server confirmation")).toBeInTheDocument();
  });

  it("labels a disconnected value as last confirmed", () => {
    render(<ContributionMeter seconds={61} status="last_confirmed" />);
    expect(screen.getByText("1m 01s")).toBeInTheDocument();
    expect(screen.getByText("watching today · last confirmed")).toBeInTheDocument();
  });
});
