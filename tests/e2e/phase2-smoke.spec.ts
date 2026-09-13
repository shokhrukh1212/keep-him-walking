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
    journey: { travelerName: null, rolloverUtcHour: 16 },
    countryDay: {
      id: dayId, dayNumber: scheduled.dayNumber, totalDays: 7, countryCode: scheduled.countryCode, countryName: scheduled.countryName,
      cityName: scheduled.cityName, timeZone: scheduled.timeZone, startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 86_400_000).toISOString(), storySummary: pack.postcard.safeCopy, scenePackId: scheduled.scenePackId,
    },
    activeEvent: null, nextEvent: null, vote: null,
    presence: { activeViewers: 1, status: "live", ttlSeconds: 50, waitingSince: null },
    countries: { live: [], todayTop: [] },
    reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
    dayPhotos: [],
    weather: null,
    steps: { global: 120, updatedAt: now.toISOString(), stale: false },
    route: { globalActiveSeconds: 30, globalDistanceMetres: 37.5, paceRate: 1, authoritativeAt: now.toISOString(), walking: true },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: true, unlockSeconds: 60, contributedSeconds: 75, url: null },
    passport: { streak: 0, collectedToday: false, collectSeconds: 30 },
    milestones: { hundredWatchersAt: null },
    assets: pack,
  };
}

async function install(page: Page, getSnapshot: () => BootstrapSnapshot = () => snapshot()) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: getSnapshot() }));
  await page.route("**/api/presence/heartbeat", (route) => {
    const now = new Date().toISOString();
    return route.fulfill({ json: { serverNow: now, realServerNow: now, activeViewers: 1, walking: true, globalSteps: 120, visitorActiveSeconds: 75, ttlSeconds: 50, nextHeartbeatInMs: 30_000, globalActiveSeconds: 30, globalDistanceMetres: 37.5, paceRate: 1, routeAuthoritativeAt: now } });
  });
  await page.route("**/api/postcards", (route) => route.fulfill({ json: { token: "x".repeat(43), url: "https://example.test/p/postcard", imageUrl: "https://example.test/card.webp", idempotent: false } }));
}

test("Phase 2 visitor surface keeps sponsor and postcard while omitting the redundant Passport link", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await install(page);
  await page.goto("/");
  await expect(page.getByText("He only walks while someone is watching.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sponsor a day" })).toBeVisible();
  await page.getByRole("button", { name: "Journey", exact: true }).click();
  const journey = page.getByRole("dialog", { name: "Journey" });
  await expect(journey).toBeVisible();
  await expect(journey.getByRole("link", { name: /Passport/ })).toHaveCount(0);
  await expect(journey.getByRole("button", { name: /Postcard/ })).toBeEnabled();
  await expect(page.locator(".pixi-scene")).toHaveAttribute("data-zone-id", "arrival-boulevard");
});

test("all seven reduced-motion country packs retain distinct complete environments", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let routeIndex = 0;
  await install(page, () => snapshot(routeIndex));
  const renderedSources = new Set<string>();

  for (const [index, expected] of PHASE2_ROUTE.entries()) {
    routeIndex = index;
    const expectedPack = getCountryPack(expected.scenePackId);
    if (!expectedPack) throw new Error(`Missing smoke-test pack ${expected.scenePackId}`);
    await page.goto(`/`);
    await expect(page.locator(".day-mark")).toContainText(expected.cityName);
    await page.getByRole("button", { name: "Journey", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Journey" }).getByRole("button", { name: /Postcard/ })).toBeEnabled();
    const scene = page.locator(".pixi-scene");
    await expect(scene).toHaveAttribute("data-zone-id", expectedPack.route.zones[0]!.id);
    // Tashkent v5 intentionally pins the approved immutable v4 image URLs, so
    // assert the authored URL rather than deriving one from the pack identity.
    const expectedPath = expectedPack.route.zones[0]!.fallbackUrl;
    await expect(scene).toHaveAttribute("data-scene-textures", new RegExp(expectedPath));
    const source = await scene.getAttribute("data-scene-textures");
    expect(source).toContain(expectedPath);
    renderedSources.add(source ?? "");
  }

  expect(renderedSources.size).toBe(PHASE2_ROUTE.length);
});

test("bootstrap polling recovers after a transient failure and applies the next country", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await install(page);
  let requests = 0;
  await page.route("**/api/bootstrap", (route) => {
    requests += 1;
    if (requests === 1) {
      return route.fulfill({ status: 503, json: { error: "transient preview failure" } });
    }
    return route.fulfill({ json: snapshot(1) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-banner.offline")).toBeVisible();
  await expect(page.locator(".day-mark")).toContainText("Dushanbe", { timeout: 12_000 });
  await expect(page.locator(".connection-banner.offline")).toHaveCount(0);
  expect(requests).toBeGreaterThanOrEqual(2);
});

test("postcard state resets when the live country rolls over without navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let routeIndex = 0;
  await install(page, () => {
    const next = snapshot(routeIndex);
    next.countryDay.id = `10000000-0000-4000-8000-${String(70 + routeIndex).padStart(12, "0")}`;
    next.refresh.afterMs = 1_000;
    return next;
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Journey", exact: true }).click();
  await page.getByRole("dialog", { name: "Journey" }).getByRole("button", { name: /^Postcard$/ }).click();
  await expect(page.getByRole("button", { name: "View postcard" })).toBeVisible();
  routeIndex = 1;
  await expect(page.locator(".day-mark")).toContainText("Dushanbe", { timeout: 5_000 });
  await expect(page.getByRole("dialog", { name: "Journey" }).getByRole("button", { name: /^Postcard$/ })).toBeVisible();
});

test("a closed daily vote is not presented as an open ballot", async ({ page }) => {
  const closed = snapshot();
  closed.vote = {
    id: "20000000-0000-4000-8000-000000000001",
    question: "Which Tashkent moment should he remember?",
    kind: "destination" as const,
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() - 1_000).toISOString(),
    status: "closed",
    totalBallots: 7,
    selectedOptionId: null,
    resultOptionId: null,
    options: [
      { id: "20000000-0000-4000-8000-000000000002", label: "Chorsu market", displayOrder: 0, packId: null, countryCode: null, blurb: null, votes: 5 },
      { id: "20000000-0000-4000-8000-000000000003", label: "Hazrati Imam", displayOrder: 1, packId: null, countryCode: null, blurb: null, votes: 2 },
    ],
  };
  await install(page, () => closed);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Destination vote/ })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Tomorrow’s vote" })).toHaveCount(0);
});
