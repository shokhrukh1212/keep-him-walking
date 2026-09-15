import { describe, expect, it, vi } from "vitest";
import { loadBuyMeACoffeeSupporters, paginateSupporters, publicSupporterFromBuyMeACoffee } from "./buy-me-a-coffee";

describe("Buy Me a Coffee supporter projection", () => {
  it("keeps only public acknowledgement fields and honours anonymous visibility", () => {
    expect(publicSupporterFromBuyMeACoffee({
      supporter_id: 12,
      supporter_name: "Alex",
      support_coffees: "3",
      support_created_on: "2034-01-01T12:00:00Z",
      supporter_email: "private@example.test",
      support_note: "private note",
    })).toEqual({ id: "12", displayName: "Alex", coffeeCount: 3, occurredAt: "2034-01-01T12:00:00.000Z" });
    expect(publicSupporterFromBuyMeACoffee({
      supporter_id: 13, supporter_name: "Private", support_visibility: 0, support_coffees: 1,
      support_created_on: "2034-01-02T12:00:00Z",
    })).toMatchObject({ displayName: "Anonymous supporter", coffeeCount: 1 });
  });

  it("reads every provider page without storing duplicate transactions", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ supporter_id: 1, supporter_name: "First", support_coffees: 1, support_created_on: "2034-01-01T00:00:00Z" }],
        next_page_url: "https://developers.buymeacoffee.com/api/v1/supporters?page=2",
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { supporter_id: 1, supporter_name: "First", support_coffees: 1, support_created_on: "2034-01-01T00:00:00Z" },
          { supporter_id: 2, supporter_name: "Second", support_created_on: "2034-01-02T00:00:00Z" },
        ], next_page_url: null,
      })));
    vi.stubGlobal("fetch", fetch);
    await expect(loadBuyMeACoffeeSupporters("server-token")).resolves.toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer server-token" }) });
  });

  it("shows a chronological page and keeps earlier items available", () => {
    const all = Array.from({ length: 25 }, (_, index) => ({
      id: String(index + 1), occurredAt: `2034-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, displayName: `S${index + 1}`, coffeeCount: null,
    }));
    const latest = paginateSupporters(all, null);
    expect(latest.items[0]?.id).toBe("6");
    expect(latest.hasEarlier).toBe(true);
    expect(paginateSupporters(all, latest.items[0]!.id).items[0]?.id).toBe("1");
  });
});
