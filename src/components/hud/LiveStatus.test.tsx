import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveStatus } from "./LiveStatus";

describe("LiveStatus", () => {
  it("never invents a count while offline", () => {
    render(<LiveStatus activeViewers={null} paceRate={1} walking={false} status="offline" onShare={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Live count unavailable");
    expect(screen.queryByText(/people watching/)).not.toBeInTheDocument();
  });

  it("explains the walking rule when live", () => {
    const onShare = vi.fn();
    render(<LiveStatus activeViewers={2} paceRate={2} walking status="live" onShare={onShare} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 people watching");
    expect(screen.getByRole("status")).toHaveTextContent("The internet is keeping him moving · ×2");
    fireEvent.click(screen.getByRole("button", { name: "bring a friend → faster" }));
    expect(onShare).toHaveBeenCalledOnce();
  });

  it("shows one decimal for a non-integer pace", () => {
    render(<LiveStatus activeViewers={3} paceRate={2.584_962_5} walking status="live" onShare={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("×2.6");
  });

  it("names both the wake beat and a confirmed waiting timestamp", () => {
    const { rerender } = render(
      <LiveStatus
        activeViewers={1}
        paceRate={1}
        walking={false}
        status="live"
        onShare={vi.fn()}
        wakeCountdown={3}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("You’re here · he starts walking in 3…");

    rerender(
      <LiveStatus
        activeViewers={0}
        paceRate={1}
        walking={false}
        status="live"
        onShare={vi.fn()}
        waitingSinceLocalTime="03:12"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for the internet · since 03:12");
  });
});
