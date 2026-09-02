import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { tashkentCountryPackV3 } from "../../src/content/countries/tashkent.v3";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

const evidenceRoot = "artifacts/phase15-visual-v3";

function snapshot(routeSeconds: number): BootstrapSnapshot {
  const now = new Date();
  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    mode: "live",
    journeyState: "live",
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
    countryDay: {
      id: tashkentCountryPackV3.countryDayId,
      dayNumber: 1,
      totalDays: 195,
      countryCode: "UZ",
      countryName: "Uzbekistan",
      cityName: "Tashkent",
      timeZone: "Asia/Tashkent",
      startsAt: new Date(now.getTime() - 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 86_340_000).toISOString(),
      storySummary: "The journey begins in Tashkent.",
      scenePackId: tashkentCountryPackV3.assetVersion,
    },
    activeEvent: null,
    nextEvent: null,
    vote: null,
    presence: { activeViewers: 1, status: "live", ttlSeconds: 1 },
    steps: { global: Math.floor(routeSeconds * 1.8), updatedAt: now.toISOString(), stale: false },
    route: { globalActiveSeconds: routeSeconds, authoritativeAt: now.toISOString(), walking: true },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: false, unlockSeconds: 60, contributedSeconds: 0, url: null },
    assets: tashkentCountryPackV3,
  };
}

async function installApi(page: Page, getRouteSeconds: () => number) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(getRouteSeconds()) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    const now = new Date().toISOString();
    const routeSeconds = getRouteSeconds();
    await route.fulfill({ json: {
      serverNow: now,
      activeViewers: 1,
      walking: true,
      globalSteps: Math.floor(routeSeconds * 1.8),
      visitorActiveSeconds: routeSeconds,
      ttlSeconds: 1,
      nextHeartbeatInMs: 500,
      globalActiveSeconds: routeSeconds,
      routeAuthoritativeAt: now,
    } });
  });
}

test("captures coherent full-motion zones and the complete reduced-motion fallback", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await mkdir(evidenceRoot, { recursive: true });
  const evidencePrefix = testInfo.project.name === "chromium" ? "desktop" : testInfo.project.name;
  let routeSeconds = 36;
  await installApi(page, () => routeSeconds);

  const captureZone = async (seconds: number, zone: string, name: string) => {
    routeSeconds = seconds;
    await page.goto("/?debug=world&quality=high");
    const diagnostics = page.getByTestId("world-diagnostics");
    await expect(diagnostics).toHaveAttribute("data-zone", zone, { timeout: 20_000 });
    await expect(diagnostics).toContainText("WORLD / pixi / high");
    await expect(page.locator(".traveler-sprite[data-state='walk']")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: `${evidenceRoot}/${evidencePrefix}-${name}.png`, fullPage: true });
  };

  await captureZone(36, "arrival-boulevard", "arrival-full-motion");
  await captureZone(156, "mahalla-street", "mahalla-full-motion");
  await captureZone(276, "chorsu-market", "chorsu-full-motion");

  await page.evaluate(() => localStorage.setItem("khw_reduced_motion", "true"));
  routeSeconds = 276;
  await page.goto("/");
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "static");
  await expect(page.locator("main.journey-shell")).toHaveAttribute("data-motion", "reduced");
  if (testInfo.project.name === "chromium") {
    await expect(page.getByRole("button", { name: "Motion reduced" })).toBeVisible();
  }
  await expect(page.locator(".static-scene img")).toHaveAttribute(
    "src",
    /chorsu-market\/fallback\.webp/,
  );
  await expect(page.locator(".route-status strong")).toHaveText("Chorsu market");
  await expect(page.locator(".traveler-sprite img")).toHaveAttribute("src", /walk-8\.webp/);
  await page.waitForTimeout(800);
  await page.screenshot({
    path: `${evidenceRoot}/${evidencePrefix}-chorsu-reduced-motion.png`,
    fullPage: true,
  });
});
