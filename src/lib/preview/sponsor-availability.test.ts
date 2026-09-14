import { describe, expect, it, vi } from "vitest";
import { seasonSponsorshipOpen } from "./sponsor-availability";

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(
  typeof body === "string" ? body : JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
)) as unknown as typeof fetch;

describe("season sponsorship availability", () => {
  it("is open only for this season, while nobody sponsors it", async () => {
    expect(await seasonSponsorshipOpen(1, answer(200, { season: { number: 1 }, currentSponsor: null }))).toBe(true);
    expect(await seasonSponsorshipOpen(1, answer(200, { season: { number: 2 }, currentSponsor: null }))).toBe(false);
    expect(await seasonSponsorshipOpen(1, answer(200, { season: null, currentSponsor: null }))).toBe(false);
    expect(await seasonSponsorshipOpen(1, answer(200, {
      season: { number: 1 }, currentSponsor: { name: "Example", seasonNumber: 1 },
    }))).toBe(false);
  });

  it("treats every failure as not open", async () => {
    expect(await seasonSponsorshipOpen(1, answer(404, { error: "Season sponsorship is not offered." }))).toBe(false);
    expect(await seasonSponsorshipOpen(1, answer(503, { error: "unavailable" }))).toBe(false);
    expect(await seasonSponsorshipOpen(1, answer(200, "not json"))).toBe(false);
    expect(await seasonSponsorshipOpen(1, vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toBe(false);
  });
});
