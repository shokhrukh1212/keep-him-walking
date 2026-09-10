import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
vi.mock("@/content/countries/registry", () => ({
  getCountryPack: (id: string) => id === "tashkent-v4" ? {
    assetVersion: id,
    route: { zones: [{ id: "arrival-boulevard" }] },
  } : null,
}));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: () => ({ rpc }) }));
vi.mock("@/lib/identity/server", () => ({ VISITOR_COOKIE: "khw_visitor", newVisitorId: () => "visitor-test-id", hashOpaqueValue: () => "a".repeat(64) }));
vi.mock("@/lib/observability/route", () => ({ withRouteTelemetry: (_name: string, handler: unknown) => handler }));

import { handleCorrectionPost } from "./handler";

function request(body: unknown) {
  return new NextRequest("https://keephimwalking.lol/api/corrections", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://keephimwalking.lol", "x-vercel-ip-country": "uz" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/corrections", () => {
  beforeEach(() => rpc.mockReset());

  it("validates the zone before any private text reaches storage", async () => {
    const response = await handleCorrectionPost(request({ packId: "tashkent-v4", zoneId: "wrong-zone", category: "place", body: "Private text" }));
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stores through the RPC and returns no submitted text", async () => {
    rpc.mockResolvedValue({ data: [{ out_id: 10, out_rate_limited: false }], error: null });
    const response = await handleCorrectionPost(request({ packId: "tashkent-v4", zoneId: "arrival-boulevard", category: "place", body: "Private text" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accepted: true });
    expect(rpc).toHaveBeenCalledWith("submit_correction", expect.objectContaining({ p_country_code: "UZ", p_body: "Private text" }));
  });

  it("preserves the database-enforced hourly limit", async () => {
    rpc.mockResolvedValue({ data: [{ out_id: null, out_rate_limited: true }], error: null });
    const response = await handleCorrectionPost(request({ packId: "tashkent-v4", category: "other", body: "Private text" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3600");
  });
});
