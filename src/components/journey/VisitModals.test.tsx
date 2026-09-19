import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisitModals } from "./VisitModals";
import { useVisitModals } from "@/hooks/useVisitModals";
import { SUPPORT_ACTIVE_MS, INTRO_DELAY_MS, INTRO_TO_SUPPORT_GAP_MS, UNBLOCKED_SETTLE_MS } from "@/lib/ui/visit-modals";
import { VISIT_MODAL_KEYS, clearVisitModalRecords } from "@/lib/ui/visit-modal-storage";

const tracked: Array<[string, Record<string, unknown>]> = [];

vi.mock("@/lib/analytics/client", () => ({
  trackVisitorEvent: (event: string, data: Record<string, unknown> = {}) => {
    tracked.push([event, data]);
  },
}));

type HarnessProps = {
  blocked?: boolean;
  supportEligible?: boolean;
  returningVisitor?: boolean | null;
  coffeeUrl?: string | null;
  watcherCount?: number | null;
  onJourney?: () => void;
  onSponsor?: () => void;
};

function Harness({
  blocked = false, supportEligible = true, returningVisitor = false,
  coffeeUrl = "https://buymeacoffee.com/example", watcherCount = 7,
  onJourney = () => undefined, onSponsor = () => undefined,
}: HarnessProps) {
  const [sceneReady, setSceneReady] = useState(false);
  const controller = useVisitModals({ sceneReady, blocked, supportEligible, returningVisitor });
  return (
    <>
      <main className="journey-shell">
        <button type="button" onClick={() => setSceneReady(true)}>Scene ready</button>
      </main>
      <VisitModals
        open={controller.open}
        controller={controller}
        totalDays={14}
        whereLine="He’s in Paris, France right now, on day 1 of 14."
        watcherCount={watcherCount}
        coffeeUrl={coffeeUrl}
        onJourney={onJourney}
        onSponsor={onSponsor}
      />
    </>
  );
}

/** Lets the queue's tick run for `ms` of fake time. */
async function pass(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  tracked.length = 0;
  window.localStorage.clear();
  clearVisitModalRecords();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the introduction", () => {
  it("appears once the scene has been up for the delay, and records itself", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness />);
    await pass(5_000);
    expect(screen.queryByTestId("intro-modal")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(INTRO_DELAY_MS - 500);
    expect(screen.queryByTestId("intro-modal")).toBeNull();

    await pass(1_000);
    const dialog = await screen.findByRole("dialog", { name: /He only walks while someone is watching/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("He’s in Paris, France right now, on day 1 of 14.")).toBeInTheDocument();
    expect(screen.getByTestId("intro-modal-watchers")).toHaveTextContent("You're one of 7 people keeping him moving.");
    expect(window.localStorage.getItem(VISIT_MODAL_KEYS.intro)).not.toBeNull();
    expect(tracked.map(([event]) => event)).toEqual(["intro_modal_shown"]);
  });

  it("never returns for a visitor who has already seen it", async () => {
    window.localStorage.setItem(VISIT_MODAL_KEYS.intro, new Date().toISOString());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(10_000);
    expect(screen.queryByTestId("intro-modal")).toBeNull();
  });

  it("never returns for a visitor the server already knows, even with storage cleared", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness returningVisitor />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(10_000);
    expect(screen.queryByTestId("intro-modal")).toBeNull();
  });

  it("leaves out the live line when no count is confirmed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness watcherCount={null} />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(2_000);
    await screen.findByTestId("intro-modal");
    expect(screen.queryByTestId("intro-modal-watchers")).toBeNull();
  });

  it("closes on the button, on Escape and on the circular close, and says which", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(2_000);
    await screen.findByTestId("intro-modal");
    await user.click(screen.getByRole("button", { name: "Start watching" }));
    await waitFor(() => expect(screen.queryByTestId("intro-modal")).toBeNull());
    expect(tracked).toContainEqual(["intro_modal_dismissed", { method: "button" }]);
    unmount();

    window.localStorage.clear();
    clearVisitModalRecords();
    tracked.length = 0;
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(2_000);
    await screen.findByTestId("intro-modal");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("intro-modal")).toBeNull());
    expect(tracked).toContainEqual(["intro_modal_dismissed", { method: "escape" }]);
  });

  it("hands over to the Journey panel without reporting a dismissal", async () => {
    const onJourney = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness onJourney={onJourney} />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(2_000);
    await screen.findByTestId("intro-modal");
    await user.click(screen.getByRole("button", { name: "What is this?" }));
    await waitFor(() => expect(screen.queryByTestId("intro-modal")).toBeNull());
    expect(onJourney).toHaveBeenCalledOnce();
    expect(tracked.map(([event]) => event)).toEqual(["intro_modal_shown", "intro_modal_journey_click"]);
  });
});

describe("the support ask", () => {
  /** A session that has already had, and closed, the introduction. */
  function watched() {
    window.localStorage.setItem(VISIT_MODAL_KEYS.intro, new Date(Date.now() - 600_000).toISOString());
  }

  it("arrives after the active-watching threshold, with the seconds it counted", async () => {
    watched();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(SUPPORT_ACTIVE_MS - 5_000);
    expect(screen.queryByTestId("support-modal")).toBeNull();

    await pass(6_000);
    await screen.findByRole("dialog", { name: /You’ve kept him walking for a minute/ });
    expect(screen.getByText("Still here")).toBeInTheDocument();
    const [event, data] = tracked.find(([name]) => name === "support_modal_shown")!;
    expect(event).toBe("support_modal_shown");
    expect(data.active_seconds).toBeGreaterThanOrEqual(SUPPORT_ACTIVE_MS / 1_000);
    expect(window.localStorage.getItem(VISIT_MODAL_KEYS.support)).not.toBeNull();
  });

  it("pauses its timer while the tab is hidden", async () => {
    watched();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(30_000);

    visibility.mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await pass(10 * SUPPORT_ACTIVE_MS);
    expect(screen.queryByTestId("support-modal")).toBeNull();

    visibility.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await pass(SUPPORT_ACTIVE_MS - 30_000 + 1_000);
    await screen.findByTestId("support-modal");
  });

  it("pauses its timer while the window is unfocused", async () => {
    watched();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(30_000);

    focus.mockReturnValue(false);
    await act(async () => { window.dispatchEvent(new Event("blur")); });
    await pass(10 * SUPPORT_ACTIVE_MS);
    expect(screen.queryByTestId("support-modal")).toBeNull();

    focus.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await pass(SUPPORT_ACTIVE_MS - 30_000 + 1_000);
    await screen.findByTestId("support-modal");
  });

  it("stays away from a journey it would misdescribe", async () => {
    watched();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness supportEligible={false} />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(SUPPORT_ACTIVE_MS + 5_000);
    expect(screen.queryByTestId("support-modal")).toBeNull();
  });

  it("sends the sponsor and the coffee link where the dock sends them", async () => {
    watched();
    const onSponsor = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness onSponsor={onSponsor} />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(SUPPORT_ACTIVE_MS + 1_000);
    await screen.findByTestId("support-modal");

    const coffee = screen.getByRole("link", { name: /Buy him a coffee/ });
    expect(coffee).toHaveAttribute("target", "_blank");
    expect(coffee).toHaveAttribute("rel", "noopener noreferrer");

    await user.click(screen.getByRole("button", { name: "See sponsor placements" }));
    await waitFor(() => expect(screen.queryByTestId("support-modal")).toBeNull());
    expect(onSponsor).toHaveBeenCalledOnce();
    expect(tracked.map(([event]) => event)).toContain("support_modal_sponsor_click");
  });

  it("closes quietly on Just watching", async () => {
    watched();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(SUPPORT_ACTIVE_MS + 1_000);
    await screen.findByTestId("support-modal");
    await user.click(screen.getByRole("button", { name: "Just watching" }));
    await waitFor(() => expect(screen.queryByTestId("support-modal")).toBeNull());
    expect(tracked).toContainEqual(["support_modal_dismissed", { method: "button" }]);
  });
});

describe("the queue", () => {
  it("never stacks the two, and leaves the gap after the introduction closes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(SUPPORT_ACTIVE_MS + 5_000);
    // Long past the support threshold, but the introduction still owns the screen.
    expect(screen.getByTestId("intro-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("support-modal")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Start watching" }));
    await waitFor(() => expect(screen.queryByTestId("intro-modal")).toBeNull());
    await pass(INTRO_TO_SUPPORT_GAP_MS - 2_000);
    expect(screen.queryByTestId("support-modal")).toBeNull();

    await pass(3_000);
    await screen.findByTestId("support-modal");
  });

  it("holds back while another surface is open and shows it after the page settles", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender } = render(<Harness blocked />);
    await user.click(screen.getByRole("button", { name: "Scene ready" }));
    await pass(10_000);
    expect(screen.queryByTestId("intro-modal")).toBeNull();

    rerender(<Harness blocked={false} />);
    await pass(UNBLOCKED_SETTLE_MS - 2_000);
    expect(screen.queryByTestId("intro-modal")).toBeNull();

    await pass(3_000);
    await screen.findByTestId("intro-modal");
  });
});
