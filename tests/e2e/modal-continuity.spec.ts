import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { parisCountryPackV2 } from "../../src/content/countries/paris.v2";
import type { VoteView } from "../../src/lib/contracts";
import { evidenceRoot, installJourneyApi, sampleFrames, settled, type JourneyState } from "./helpers/journey-api";

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

const vote: VoteView = {
  id: "30000000-0000-4000-8000-000000000128",
  question: "Where should he walk tomorrow?",
  kind: "destination",
  opensAt: "2026-09-12T16:00:00Z",
  closesAt: "2026-09-13T16:00:00Z",
  status: "open",
  totalBallots: 25,
  selectedOptionId: null,
  resultOptionId: null,
  options: [
    { id: "a", label: "Lyon", displayOrder: 0, packId: null, countryCode: "FR", blurb: null, votes: 13 },
    { id: "b", label: "Brussels", displayOrder: 1, packId: null, countryCode: "BE", blurb: null, votes: 12 },
  ],
};

test.use({ deviceScaleFactor: 1.5 });

/** Everything that would change if a modal moved, resized or rebuilt the world. */
async function sceneFingerprint(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(".scene-stage")!;
    const world = document.querySelector<HTMLElement>(".pixi-scene")!;
    const character = document.querySelector<HTMLElement>("[data-testid='product-character-stage']")!;
    const box = stage.getBoundingClientRect();
    return {
      canvases: [...stage.querySelectorAll("canvas")].map((canvas) => canvas.dataset.continuityToken ?? "new"),
      worldMounts: world.dataset.mountCount ?? null,
      characterMounts: character.dataset.mountCount ?? null,
      stage: [box.x, box.y, box.width, box.height].map(Math.round),
      groundY: world.dataset.groundY ?? null,
      personHeight: world.dataset.personHeight ?? null,
      footY: Math.round(Number(character.dataset.footY)),
    };
  });
}

async function expectSceneUnchanged(page: Page, before: Awaited<ReturnType<typeof sceneFingerprint>>) {
  const after = await sceneFingerprint(page);
  expect({ ...after, footY: 0 }).toEqual({ ...before, footY: 0 });
  // Feet stay on the same ground line; the gait moves them by a pixel or two.
  expect(Math.abs(after.footY - before.footY)).toBeLessThanOrEqual(4);
}

async function expectInsideViewport(page: Page, dialogName: string, viewport: { width: number; height: number }) {
  const box = await page.getByRole("dialog", { name: dialogName }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const viewport of viewports) {
  test(`modals leave the scene untouched at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(180_000);
    await mkdir(evidenceRoot, { recursive: true });
    const state: JourneyState = { rawSeconds: 90, sessions: new Set(), vote };
    await installJourneyApi(page, state);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await settled(page);
    await page.locator(".scene-stage canvas").evaluateAll((canvases) => {
      canvases.forEach((canvas, index) => { canvas.dataset.continuityToken = `canvas-${index}`; });
    });
    const before = await sceneFingerprint(page);
    expect(before.canvases).toEqual(["canvas-0", "canvas-1"]);

    const journeyButton = page.getByRole("button", { name: "Journey", exact: true });
    const frames = await sampleFrames(page, 2_500, async () => {
      await journeyButton.click({ force: true });
      await expect(page.getByRole("dialog", { name: "Journey" })).toBeVisible();
    });
    const journey = page.getByRole("dialog", { name: "Journey" });
    await expect(page).toHaveURL(/panel=journey/);
    await expectInsideViewport(page, "Journey", viewport);
    const close = page.getByRole("button", { name: "Close Journey" });
    await expect(close).toBeFocused();
    // Removed from Journey; the corrections queue itself still exists elsewhere.
    await expect(journey.getByText(/tell us what we got wrong/i)).toHaveCount(0);
    await expect(journey.getByRole("button", { name: "Passport", exact: true })).toHaveCount(0);
    await expect(journey.getByRole("button", { name: "Sponsor a day" })).toBeAttached();
    await expect(journey.getByRole("link", { name: "Privacy" })).toBeAttached();

    // The body scrolls; the header and its X stay put.
    await page.screenshot({ path: `${evidenceRoot}/journey-modal-${viewport.width}x${viewport.height}.png` });
    await page.locator(".overlay-modal-body").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(close).toBeInViewport();
    await expect(journey.getByRole("link", { name: "Privacy" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expectSceneUnchanged(page, before);

    await page.keyboard.press("Escape");
    await expect(journey).toBeHidden();
    await expect(page).not.toHaveURL(/panel=/);
    await expect(journeyButton).toBeFocused();

    // The browser's Back button closes the modal and stays on the journey.
    await journeyButton.click({ force: true });
    await expect(journey).toBeVisible();
    await page.goBack();
    await expect(journey).toBeHidden();
    await expect(page).not.toHaveURL(/panel=/);
    await expect(page.locator(".scene-stage")).toBeVisible();

    await page.getByRole("button", { name: /^Sponsor a day/ }).click({ force: true });
    await expect(page.getByRole("dialog", { name: "Sponsor a day" })).toBeVisible();
    await expectInsideViewport(page, "Sponsor a day", viewport);
    await page.getByRole("button", { name: "Close Sponsor a day" }).click();
    await expect(page.getByRole("dialog", { name: "Sponsor a day" })).toBeHidden();

    await page.locator(".vote-chip").click({ force: true });
    const ballot = page.getByRole("dialog", { name: "Tomorrow’s vote" });
    await expect(ballot).toBeVisible();
    await expect(ballot).toContainText("Where should he walk tomorrow?");
    await expectInsideViewport(page, "Tomorrow’s vote", viewport);
    if (viewport.width === 390) await page.screenshot({ path: `${evidenceRoot}/vote-modal-390x844.png` });
    await page.keyboard.press("Escape");
    await expect(ballot).toBeHidden();

    await page.getByRole("button", { name: "1 person watching" }).click({ force: true });
    await expect(page.getByRole("dialog", { name: "Who is carrying him" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expectSceneUnchanged(page, before);
    expect(state.sessions?.size).toBe(1);
    await writeFile(
      `${evidenceRoot}/modal-${viewport.width}x${viewport.height}.json`,
      `${JSON.stringify({ viewport, deviceScaleFactor: 1.5, openFrames: frames, worldMounts: before.worldMounts, presenceSessions: state.sessions?.size }, null, 2)}\n`,
    );
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`place dots come from the manifest and never move him at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(150_000);
    await mkdir(evidenceRoot, { recursive: true });
    // 500 walking seconds: the second place, with 340 s to the next one.
    // A UI-only ten-place fixture proves the target layout without adding fake
    // places or duplicated paintings to a published content pack.
    const assets = structuredClone(parisCountryPackV2);
    assets.assetVersion = "paris-v2-ten-place-test";
    assets.route.zones = Array.from({ length: 10 }, (_, index) => ({
      ...structuredClone(parisCountryPackV2.route.zones[index % parisCountryPackV2.route.zones.length]!),
      id: `test-place-${index + 1}`,
      label: `Review place ${index + 1}`,
    }));
    const state: JourneyState = { rawSeconds: 500, assets };
    await installJourneyApi(page, state);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await settled(page);
    const world = page.locator(".pixi-scene");
    await expect(world).toHaveAttribute("data-zone-id", "test-place-2");

    await expect(page.locator(".place-dot")).toHaveCount(10);
    await expect(page.getByRole("button", { name: "Stop 2 of 10, Review place 2, you are here" }))
      .toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("list", { name: /^Stop 2 of 10\. Next place in about 6 minutes of walking\.$/ })).toBeAttached();
    await expect(page.locator(".goal-copy strong")).toHaveAttribute("aria-label", /^0\.6 \/ 8 km together · 7%$/);
    await expect(page.locator(".goal-freshness")).toHaveText(/extrapolated|last confirmed/);
    for (const dot of await page.locator(".place-dot").all()) {
      const box = await dot.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const ninth = page.getByRole("button", { name: "Stop 9 of 10, Review place 9" });
    await ninth.scrollIntoViewIfNeeded();
    await ninth.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".place-popover")).toContainText("Review place 9");
    await expect(page.locator(".place-popover")).toContainText("In ~48 walking min");
    await page.waitForTimeout(1_200);
    await expect(world).toHaveAttribute("data-zone-id", "test-place-2");
    await page.screenshot({ path: `${evidenceRoot}/place-dot-popover-${viewport.width}.png` });
    await page.keyboard.press("Escape");
    await expect(page.locator(".place-popover")).toHaveCount(0);

    await page.getByRole("button", { name: "About the distance goals" }).click({ force: true });
    await expect(page.getByRole("note")).toContainText("42.2 km marathon");
    await page.screenshot({ path: `${evidenceRoot}/goal-info-${viewport.width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
