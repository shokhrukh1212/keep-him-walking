import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportersFeed } from "./SupportersFeed";

afterEach(() => vi.unstubAllGlobals());

describe("SupportersFeed", () => {
  it("shows an honest empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], hasEarlier: false }))));
    render(<SupportersFeed />);
    expect(await screen.findByText(/No public supporters yet/)).toBeInTheDocument();
  });

  it("renders actual counts and falls back when a count is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { id: "1", occurredAt: "2034-01-01T00:00:00Z", displayName: "Alex", coffeeCount: 3 },
      { id: "2", occurredAt: "2034-01-02T00:00:00Z", displayName: "Sam", coffeeCount: null },
    ], hasEarlier: false }))));
    render(<SupportersFeed />);
    expect(await screen.findByText("Alex bought 3 coffees")).toBeInTheDocument();
    expect(screen.getByText("Sam supported the journey")).toBeInTheDocument();
  });

  it("loads older entries only when requested", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "2", occurredAt: "2034-01-02T00:00:00Z", displayName: "New", coffeeCount: null }], hasEarlier: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "1", occurredAt: "2034-01-01T00:00:00Z", displayName: "Old", coffeeCount: 1 }], hasEarlier: false })));
    vi.stubGlobal("fetch", fetch);
    render(<SupportersFeed />);
    await userEvent.click(await screen.findByRole("button", { name: "Earlier supporters" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Old"), expect.stringContaining("New")]));
  });
});
