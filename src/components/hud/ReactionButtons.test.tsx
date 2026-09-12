import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactionButtons } from "./ReactionButtons";

const counts = { wave: 0, water: 0, photo: 0 };

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
      json: async () => ({ count: 2, threshold: 3, scheduledAt: null, cooldownSeconds: 60 }),
    }));
    render(<ReactionButtons counts={counts} activeViewers={7} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Wave added · 2/3"));
  });

  it("leaves retry feedback after a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    render(<ReactionButtons counts={counts} activeViewers={1} enabled activeCrowdKind={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Wave\./ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Couldn’t send. Try again."));
    expect(screen.getByRole("button", { name: /Wave\./ })).toBeEnabled();
  });
});
