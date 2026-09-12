import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

const evidenceRoot = "docs/launch-finalization/evidence/p27-candidate";
const dayId = "10000000-0000-4000-8000-000000000123";

function snapshot(rawSeconds: number, cityName = "Paris"): BootstrapSnapshot {
  const now = new Date();
  const base = offlineBootstrapSnapshot(now);
  return {
    ...base,
    mode: "live",
    firstVisit: false,
    countryDay: { ...base.countryDay, id: dayId, cityName },
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
    presence: { activeViewers: 1, status: "live", ttlSeconds: 50, waitingSince: null },
    route: {
      globalActiveSeconds: rawSeconds,
      globalDistanceMetres: rawSeconds * 1.25,
      paceRate: 1,
      authoritativeAt: now.toISOString(),
      walking: true,
    },
  };
}

async function installJourneyApi(page: Page, state: { rawSeconds: number; cityName?: string }) {
  // Playwright evaluates matching routes newest-first. Install the catch-all
  // first so the authoritative fixtures below win for their endpoints.
  await page.route("**/api/**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(state.rawSeconds, state.cityName) }));
  await page.route("**/api/me", (route) => route.fulfill({ json: { firstVisit: false } }));
  await page.route("**/api/observability/**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/presence/heartbeat", (route) => {
    const now = new Date().toISOString();
    return route.fulfill({ json: {
      countryDayId: dayId,
      serverNow: now,
      realServerNow: now,
      activeViewers: 1,
      walking: true,
      globalSteps: Math.floor(state.rawSeconds / 0.6),
      visitorActiveSeconds: 90,
      ttlSeconds: 50,
      nextHeartbeatInMs: 500,
      globalActiveSeconds: state.rawSeconds,
      globalDistanceMetres: state.rawSeconds * 1.25,
      paceRate: 1,
      routeAuthoritativeAt: now,
      waitingSince: null,
      wokeHim: false,
      countryCode: "FR",
      reactions: snapshot(state.rawSeconds).reactions,
    } });
  });
}

async function settled(page: Page) {
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", { timeout: 60_000 });
  await expect(page.getByTestId("product-character-stage"))
    .toHaveAttribute("data-character-ready", "true", { timeout: 60_000 });
  await expect(page.locator(".connection-banner")).toHaveCount(0, { timeout: 20_000 });
}

test("captures cold and settled launch layouts at the target widths", async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(evidenceRoot, { recursive: true });
  const state = { rawSeconds: 90 };
  await installJourneyApi(page, state);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: `${evidenceRoot}/desktop-1440-cold.png` });
  await settled(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 320, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(500);
    const dimensions = await page.evaluate(() => ({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
    for (const button of await page.locator(".reaction-button").all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `${evidenceRoot}/settled-${viewport.width}.png` });
  }
});

test("keeps one scene through URL panels, keyboard use and an 18-minute scene transition", async ({ page }) => {
  test.setTimeout(150_000);
  await mkdir(evidenceRoot, { recursive: true });
  const state = { rawSeconds: 1_080 };
  await installJourneyApi(page, state);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await settled(page);
  await expect(page.locator(".pixi-scene")).toHaveAttribute("data-zone-id", "paris-arrival");

  await page.locator(".scene-stage canvas").evaluateAll((canvases) => {
    canvases.forEach((canvas, index) => { canvas.dataset.continuityToken = `canvas-${index}`; });
  });
  await page.getByRole("button", { name: "Journey", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/panel=journey/);
  await expect(page.getByRole("dialog", { name: "Journey details" })).toBeVisible();
  await page.screenshot({ path: `${evidenceRoot}/desktop-journey-panel.png` });
  await page.getByRole("button", { name: "Passport", exact: true }).click();
  await expect(page).toHaveURL(/panel=passport/);
  await page.goBack();
  await expect(page).toHaveURL(/panel=journey/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/panel=/);
  await expect(page.locator(".scene-stage canvas[data-continuity-token]")).toHaveCount(2);

  state.rawSeconds = 1_084;
  await expect(page.locator(".pixi-scene")).toHaveAttribute("data-zone-id", "paris-lanes", { timeout: 30_000 });
  await expect(page.getByTestId("product-character-stage")).toHaveAttribute("data-zone-id", "paris-lanes");
  await page.screenshot({ path: `${evidenceRoot}/desktop-first-repeat-transition.png` });

  // Texture upload belongs to the transition measurement above. Sample steady
  // animation after that bounded handoff, matching the normal viewing state.
  await page.waitForTimeout(5_000);
  const frameDeltas = await page.evaluate(async () => {
    const values: number[] = [];
    await new Promise<void>((resolve) => {
      let previous = performance.now();
      const end = previous + 8_000;
      const sample = (now: number) => {
        values.push(now - previous);
        previous = now;
        if (now >= end) resolve(); else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return values;
  });
  const ordered = [...frameDeltas].sort((a, b) => a - b);
  const report = {
    sampleCount: frameDeltas.length,
    p95FrameDeltaMs: ordered[Math.floor(ordered.length * 0.95)] ?? null,
    maxFrameDeltaMs: ordered.at(-1) ?? null,
    framesOver50Ms: frameDeltas.filter((value) => value > 50).length,
    panelsPreservedCanvasCount: 2,
    transition: "paris-arrival -> paris-lanes",
  };
  await writeFile(`${evidenceRoot}/single-viewer-measurement.json`, `${JSON.stringify(report, null, 2)}\n`);
});

test("mobile sheet stays below the traveler and long labels do not widen the page", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(evidenceRoot, { recursive: true });
  const state = { rawSeconds: 90, cityName: "Paris — Rive gauche validation route" };
  await installJourneyApi(page, state);
  await page.setViewportSize({ width: 320, height: 667 });
  await page.goto("/");
  await settled(page);
  await page.getByRole("button", { name: "Journey", exact: true }).click({ force: true });
  const panel = page.getByRole("dialog", { name: "Journey details" });
  await expect(panel).toBeVisible();
  const panelBox = await panel.boundingBox();
  const footY = Number(await page.getByTestId("product-character-stage").getAttribute("data-foot-y"));
  expect(footY).toBeLessThan(panelBox?.y ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await panel.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect(page.getByRole("button", { name: "Passport", exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidenceRoot}/mobile-320-journey-sheet.png` });
});

test("records a short continuity review", async ({ browser }) => {
  test.setTimeout(150_000);
  await mkdir(evidenceRoot, { recursive: true });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: evidenceRoot, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const state = { rawSeconds: 1_080 };
  await installJourneyApi(page, state);
  await page.goto("/");
  await settled(page);
  const video = page.video();
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: "Journey", exact: true }).click({ force: true });
  await page.waitForTimeout(1_000);
  await page.keyboard.press("Escape");
  state.rawSeconds = 1_084;
  await expect(page.locator(".pixi-scene")).toHaveAttribute("data-zone-id", "paris-lanes", { timeout: 30_000 });
  await page.waitForTimeout(1_500);
  await context.close();
  if (video) await copyFile(await video.path(), `${evidenceRoot}/mobile-continuity.webm`);
});
