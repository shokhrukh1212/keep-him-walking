import { expect, test, type Page } from "@playwright/test";
import { getCountryPack } from "../../src/content/countries/registry";
import type { BootstrapSnapshot } from "../../src/lib/contracts";
import { PHASE2_ROUTE } from "../../src/lib/story-clock/schedule";

const dayId = "10000000-0000-4000-8000-000000000070";

function snapshot(routeIndex = 0): BootstrapSnapshot {
  const now = new Date();
  const scheduled = PHASE2_ROUTE[routeIndex];
  const pack = getCountryPack(scheduled.scenePackId);
  if (!pack || pack.schemaVersion !== 3) throw new Error(`Missing smoke-test pack ${scheduled.scenePackId}`);
  return {
    serverNow: now.toISOString(), realServerNow: now.toISOString(), mode: "live",
    journeyState: "live", refresh: { nextAt: new Date(now.getTime() + 60_000).toISOString(), afterMs: 60_000, reason: "country_rollover" },
    countryDay: {
      id: dayId, dayNumber: scheduled.dayNumber, totalDays: 7, countryCode: scheduled.countryCode, countryName: scheduled.countryName,
      cityName: scheduled.cityName, timeZone: scheduled.timeZone, startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 86_400_000).toISOString(), storySummary: pack.postcard.safeCopy, scenePackId: scheduled.scenePackId,
    },
    activeEvent: null, nextEvent: null, vote: null,
    presence: { activeViewers: 1, status: "live", ttlSeconds: 50 },
    steps: { global: 120, updatedAt: now.toISOString(), stale: false },
    route: { globalActiveSeconds: 30, authoritativeAt: now.toISOString(), walking: true },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: true, unlockSeconds: 60, contributedSeconds: 75, url: null },
    assets: { ...pack, traveler: { ...pack.traveler, riveUrl: null } },
  };
}

async function install(page: Page, getSnapshot: () => BootstrapSnapshot = () => snapshot()) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: getSnapshot() }));
  await page.route("**/api/presence/heartbeat", (route) => {
    const now = new Date().toISOString();
    return route.fulfill({ json: { serverNow: now, realServerNow: now, activeViewers: 1, walking: true, globalSteps: 120, visitorActiveSeconds: 75, ttlSeconds: 50, nextHeartbeatInMs: 30_000, globalActiveSeconds: 30, routeAuthoritativeAt: now } });
  });
  await page.route("**/api/postcards", (route) => route.fulfill({ json: { token: "x".repeat(43), url: "https://example.test/p/postcard", imageUrl: "https://example.test/card.webp", idempotent: false } }));
}

test("Phase 2 visitor surface exposes passport, sponsor, and eligible postcard without hiding the walk", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /He only walks/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Journey links" })).toContainText("Passport");
  await expect(page.getByRole("button", { name: /Postcard/ })).toBeEnabled();
  await expect(page.locator(".static-scene img")).toHaveAttribute("src", /tashkent\/v4\/zones\/arrival-boulevard\/fallback\.webp/);
});

test("all seven reduced-motion country packs retain distinct complete environments", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let routeIndex = 0;
  await install(page, () => snapshot(routeIndex));
  const renderedSources = new Set<string>();

  for (const [index, expected] of PHASE2_ROUTE.entries()) {
    routeIndex = index;
    await page.goto(`/`);
    await expect(page.locator(".day-mark")).toContainText(expected.cityName);
    await expect(page.getByRole("button", { name: /Postcard/ })).toBeEnabled();
    const scene = page.locator(".static-scene img");
    await expect(scene).toBeVisible();
    const expectedPath = `/${expected.scenePackId.replace("-v", "/v")}/zones/`;
    await expect(scene).toHaveAttribute("src", new RegExp(expectedPath));
    await expect(scene).toHaveJSProperty("complete", true);
    const source = await scene.getAttribute("src");
    expect(source).toContain(expectedPath);
    renderedSources.add(source ?? "");
  }

  expect(renderedSources.size).toBe(PHASE2_ROUTE.length);
});
