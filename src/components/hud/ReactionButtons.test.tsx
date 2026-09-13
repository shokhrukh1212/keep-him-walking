import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactionsView, ScheduledActionView } from "@/lib/contracts";
import { ReactionButtons } from "./ReactionButtons";

const counts = { wave: 0, water: 0, photo: 0 };
const board = (scheduled: ScheduledActionView[]): ReactionsView => ({ counts, scheduled, nextScheduledAction: null });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reaction lifecycle", () => {
  it("shows pending, queued, and executing as distinct states", async () => {
    let resolveRequest!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; })));
    const { rerender } = render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    expect(screen.getByRole("status")).toHaveTextContent("Sending wave…");
    resolveRequest({ ok: true, status: 200, json: async () => ({ count: 0, threshold: 1, scheduledAt: 12, cooldownSeconds: 60 }) });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Wave queued"));
    rerender(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind="wave" />);
    expect(screen.getByRole("status")).toHaveTextContent("He’s waving");
  });

  it("shows the server-confirmed contribution before threshold", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 2, threshold: 3, scheduledAt: null, requestExpiresAt: new Date(Date.now() + 20_000).toISOString(), cooldownSeconds: 60 }),
    }));
    render(<ReactionButtons counts={counts} activeViewers={7} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Wave added · 2/3"));
  });

  it("explains when a contribution expires before reaching its threshold", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 2, threshold: 3, scheduledAt: null, requestExpiresAt: new Date(Date.now() - 1).toISOString(), cooldownSeconds: 60 }),
    }));
    render(<ReactionButtons counts={counts} activeViewers={7} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Wave request expired — ask again."));
  });

  it("leaves retry feedback after a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Couldn’t send. Try again."));
    expect(screen.getByRole("button", { name: /Wave\./ })).toBeEnabled();
  });

  it("hands the answer's board to the page and says whether he will act", async () => {
    const answered = board([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 1, threshold: 3, scheduledAt: null, cooldownSeconds: 60, reactions: answered }),
    }));
    const onReactions = vi.fn();
    const onConfirmed = vi.fn();
    const reconcile = vi.fn(async () => null);
    render(<ReactionButtons counts={counts} activeViewers={7} enabled activeCrowdKind={null}
      onReactions={onReactions} onConfirmed={onConfirmed} reconcile={reconcile} />);
    fireEvent.click(screen.getByRole("button", { name: /Water\./ }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(false));
    expect(onReactions).toHaveBeenCalledWith(answered);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("checks an unanswered request before calling it a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("The operation timed out.")));
    const onScheduled = vi.fn();
    const onConfirmed = vi.fn();
    const reconcile = vi.fn(async () => board([{ kind: "wave", atActiveSecond: 42 }]));
    render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null}
      scheduled={[]} onScheduled={onScheduled} onConfirmed={onConfirmed} reconcile={reconcile} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Wave queued"));
    expect(onScheduled).toHaveBeenCalledWith("wave", 42);
    expect(onConfirmed).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: /Wave, available again/ })).toBeDisabled();
  });

  it("still reports a failure when the check finds nothing new", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const earlier: ScheduledActionView[] = [{ kind: "wave", atActiveSecond: 20 }];
    render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null}
      scheduled={earlier} activeSeconds={500} reconcile={async () => board(earlier)} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Couldn’t send. Try again."));
  });

  it("explains a repeat request instead of calling it a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ reason: "cooldown", retryAfterSeconds: 42 }),
    }));
    render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("You already asked for a wave. Again in 42s."));
    expect(screen.getByRole("button", { name: /Wave, available again in 42 seconds/ })).toBeDisabled();
  });

  it("says when a page is not yet counted as watching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "not_watching" }),
    }));
    render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Photo\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("You aren’t counted as watching yet."));
  });

  it("rests a reaction for everyone after he does it", () => {
    render(<ReactionButtons counts={{ wave: 5, water: 0, photo: 0 }} activeViewers={20} enabled activeCrowdKind={null}
      scheduled={[{ kind: "wave", atActiveSecond: 100 }]} activeSeconds={130} />);
    const wave = screen.getByRole("button", { name: /Wave, available again in about 90 seconds/ });
    expect(wave).toBeDisabled();
    expect(wave).toHaveTextContent("~90s");
    expect(wave).toHaveAttribute("data-state", "resting");
    expect(screen.getByRole("button", { name: /Water\./ })).toBeEnabled();
  });

  it("tells a request that arrived during the rest how long is left", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "resting", restUntilActiveSecond: 125 }),
    }));
    const { rerender } = render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null}
      scheduled={[]} activeSeconds={10} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Wave is ready again"));
    rerender(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null}
      scheduled={[{ kind: "wave", atActiveSecond: 5 }]} activeSeconds={10} />);
    expect(screen.getByRole("status")).toHaveTextContent("He just waved. Ask again in about 115s.");
  });
});
