import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LaunchCelebration } from "./LaunchCelebration";

const props = {
  startsAt: "2026-09-24T17:00:00Z",
  localTime: "7:00 PM",
  utcTime: "5:00 PM",
  shareText: "Milo starts walking in Paris today at 7:00 PM France time (5:00 PM UTC). Come watch and support his journey!",
  sceneReady: true,
  blocked: false,
  onOpenChange: () => undefined,
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe("launch celebration", () => {
  it("waits for the traveler, then offers an X draft with the site URL once per session", async () => {
    const { rerender, unmount } = render(<><main className="journey-shell" /><LaunchCelebration {...props} sceneReady={false} /></>);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.queryByTestId("launch-celebration")).toBeNull();
    rerender(<><main className="journey-shell" /><LaunchCelebration {...props} /></>);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole("dialog", { name: "Milo starts walking today!" })).toBeInTheDocument();
    expect(document.querySelector(".launch-celebration-time")).toHaveTextContent("7:00 PM France time · 5:00 PM UTC");
    const share = screen.getByRole("link", { name: "Share on X" });
    const draft = new URL(share.getAttribute("href")!);
    expect(draft.searchParams.get("text")).toBe(props.shareText);
    expect(draft.searchParams.get("url")).toBe("https://keephimwalking.com");
    unmount();
    render(<><main className="journey-shell" /><LaunchCelebration {...props} /></>);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.queryByTestId("launch-celebration")).toBeNull();
  });

  it("closes on Keep watching", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<><main className="journey-shell" /><LaunchCelebration {...props} /></>);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await user.click(screen.getByRole("button", { name: "Keep watching" }));
    expect(screen.queryByTestId("launch-celebration")).toBeNull();
  });
});
