import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INITIAL_AUDIENCE_COUNTS, mergeAudienceRead } from "@/hooks/useOnlineVisitors";
import { AudienceMetrics } from "./AudienceMetrics";

const formatTime = (iso: string) => iso.slice(11, 16);
const good = mergeAudienceRead(INITIAL_AUDIENCE_COUNTS, { online: 5, allTime: 1234, fetchedAt: "2026-09-16T10:00:00.000Z" }, "2026-09-16T10:00:01.000Z");

describe("AudienceMetrics", () => {
  it("shows both DataFast counts, the tracking start, the time and the public dashboard link", () => {
    render(<AudienceMetrics counts={good} dashboardUrl="https://datafa.st/share/keephimwalking.com" formatTime={formatTime} />);
    expect(screen.getByTestId("audience-active")).toHaveTextContent("5Active in the last 10 minutes");
    expect(screen.getByTestId("audience-all-time")).toHaveTextContent("1,234Unique visitors · all timesince 15 September 2026");
    expect(screen.getByTestId("audience-updated")).toHaveTextContent("Updated 10:00");
    expect(screen.getByRole("link", { name: "View public analytics on DataFast ↗" })).toHaveAttribute("href", "https://datafa.st/share/keephimwalking.com");
  });

  it("keeps dated values when a refresh fails", () => {
    const stale = mergeAudienceRead(good, null, "2026-09-16T10:01:00.000Z");
    render(<AudienceMetrics counts={stale} dashboardUrl={null} formatTime={formatTime} />);
    expect(screen.getByTestId("audience-active")).toHaveTextContent("5");
    expect(screen.getByTestId("audience-updated")).toHaveTextContent("Last updated 10:00 · couldn’t refresh");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says unavailable, never zero, when nothing was ever read", () => {
    const failed = mergeAudienceRead(INITIAL_AUDIENCE_COUNTS, null, "2026-09-16T10:01:00.000Z");
    render(<AudienceMetrics counts={failed} dashboardUrl={null} formatTime={formatTime} />);
    expect(screen.getByTestId("audience-active")).toHaveTextContent("Unavailable");
    expect(screen.getByTestId("audience-all-time")).toHaveTextContent("Unavailable");
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByTestId("audience-updated")).toHaveTextContent("Visitor numbers are unavailable right now.");
  });
});
