import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: () => {
    throw new Error("The switched-off preview must not read the database");
  },
}));

import { serverRuntimeConfig } from "@/lib/config/server";
import { PRELAUNCH_PREVIEW_DAY_ID, liveBootstrapSnapshot, switchedOffPrelaunchSnapshot } from "./server";

afterEach(() => vi.unstubAllEnvs());

describe("the switched-off launch preview", () => {
  it("is Season 1's idle first city with nothing counted and no start time", () => {
    const snapshot = switchedOffPrelaunchSnapshot(new Date("2026-09-14T10:00:00Z"), serverRuntimeConfig());
    expect(snapshot.mode).toBe("prelaunch");
    expect(snapshot.journeyState).toBe("prelaunch");
    expect(snapshot.prelaunch).toEqual({ startsAt: null, seasonNumber: 1 });
    expect(snapshot.countryDay).toMatchObject({
      id: PRELAUNCH_PREVIEW_DAY_ID, dayNumber: 1, cityName: "Paris", scenePackId: "paris-v3",
    });
    expect(snapshot.assets.assetVersion).toBe("paris-v3");
    expect(snapshot.presence).toMatchObject({ activeViewers: null, status: "scheduled", waitingSince: null });
    expect(snapshot.route).toMatchObject({ globalActiveSeconds: 0, globalDistanceMetres: 0, walking: false });
    expect(snapshot.reactions.scheduled).toEqual([]);
    expect(snapshot.countries).toEqual({ live: [], todayTop: [] });
    expect(snapshot.vote).toBeNull();
    expect(snapshot.sponsor).toEqual({ status: "unsponsored" });
    expect(snapshot.seasonSponsor ?? null).toBeNull();
    expect(snapshot.weather).toBeNull();
    expect(snapshot.refresh.reason).toBe("none");
  });

  it("answers Production with the launch switched off before touching the database", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PHASE2_ENABLED", "true");
    vi.stubEnv("LAUNCH_ENABLED", "false");
    const snapshot = await liveBootstrapSnapshot("public-bootstrap", new Date("2026-09-14T10:00:00Z"));
    expect(snapshot?.mode).toBe("prelaunch");
    expect(snapshot?.prelaunch?.startsAt).toBeNull();
  });

  it("leaves every other environment on the live path, where a missing day stays an outage", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(liveBootstrapSnapshot("public-bootstrap")).rejects.toThrow("must not read the database");
  });
});
