import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { expect, test, type BrowserContext } from "@playwright/test";
import { parisCountryPackV3 } from "../../src/content/countries/paris.v3";
import { conversationDurationSeconds } from "../../src/lib/world/activities";
import { evidenceRoot, installJourneyApi, sampleFrames, setRawSeconds, settled, type JourneyState } from "./helpers/journey-api";

test.use({ deviceScaleFactor: 1.5 });

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 667, height: 375 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`captures the launch layout at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(180_000);
    await mkdir(evidenceRoot, { recursive: true });
    const state: JourneyState = { rawSeconds: 90 };
    await installJourneyApi(page, state);
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    if (viewport.width === 1440) {
      await page.screenshot({ path: `${evidenceRoot}/desktop-1440-cold.png` });
    }
    await settled(page);
    await page.waitForTimeout(800);
    const measurements = await page.evaluate(() => ({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controlHeights: [...document.querySelectorAll<HTMLElement>(".reaction-button, .sound-toggle, .compact-dock button")]
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => control.getBoundingClientRect().height),
    }));
    expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.controlHeights.length).toBeGreaterThan(0);
    expect(Math.min(...measurements.controlHeights)).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name: /^Sound off/ })).toBeInViewport();
    await page.screenshot({ path: `${evidenceRoot}/settled-${viewport.width}x${viewport.height}.png` });
  });
}

test("keeps one world through modals and a seven-minute place change", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The desktop measurement runs once");
  test.setTimeout(180_000);
  await mkdir(evidenceRoot, { recursive: true });
  const state: JourneyState = { rawSeconds: 380, sessions: new Set() };
  await installJourneyApi(page, state);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await settled(page);
  const world = page.locator(".pixi-scene");
  await expect(world).toHaveAttribute("data-zone-id", "paris-arrival");
  const mounts = await world.getAttribute("data-mount-count");

  await page.locator(".scene-stage canvas").evaluateAll((canvases) => {
    canvases.forEach((canvas, index) => { canvas.dataset.continuityToken = `canvas-${index}`; });
  });
  const journeyButton = page.getByRole("button", { name: "Journey", exact: true });
  const modalFrames = await sampleFrames(page, 7_000, async () => {
    for (let round = 0; round < 3; round += 1) {
      await journeyButton.click({ force: true });
      await expect(page.getByRole("dialog", { name: "Journey" })).toBeVisible();
      await page.waitForTimeout(600);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Journey" })).toBeHidden();
      await page.waitForTimeout(400);
    }
  });
  await expect(page.locator(".scene-stage canvas[data-continuity-token]")).toHaveCount(2);
  expect(await world.getAttribute("data-mount-count")).toBe(mounts);

  // The next place is already prepared before the shared clock reaches it.
  await expect(world).toHaveAttribute("data-scene-next-zone-id", "paris-lanes", { timeout: 30_000 });
  const transitionFrames = await sampleFrames(page, 4_000, async () => {
    setRawSeconds(state, 421);
    await expect(world).toHaveAttribute("data-zone-id", "paris-lanes", { timeout: 30_000 });
  });
  await expect(page.getByTestId("product-character-stage")).toHaveAttribute("data-zone-id", "paris-lanes");
  await page.screenshot({ path: `${evidenceRoot}/desktop-place-change.png` });

  await page.waitForTimeout(5_000);
  const steadyFrames = await sampleFrames(page, 8_000);
  expect(await world.getAttribute("data-mount-count")).toBe(mounts);
  expect(state.sessions?.size).toBe(1);
  await writeFile(`${evidenceRoot}/frames-desktop-1440.json`, `${JSON.stringify({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    renderer: "headless Chromium (software GL); not a physical device",
    modalOpenClose: modalFrames,
    placeChange: transitionFrames,
    steadyWalk: steadyFrames,
    worldMountCount: mounts,
    presenceSessions: state.sessions?.size,
  }, null, 2)}\n`);
});

test("records a short motion review: a modal, a place change and reciprocal dialogue", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The recording runs once");
  test.setTimeout(180_000);
  await mkdir(evidenceRoot, { recursive: true });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1.5,
    recordVideo: { dir: evidenceRoot, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const assets = structuredClone(parisCountryPackV3);
  assets.conversations = assets.conversations.map((script) => ({ ...script, review: "approved" as const }));
  const script = assets.conversations.find((item) => item.id === "paris-canal-footbridge")!;
  const state: JourneyState = { rawSeconds: 405, advancing: true, assets };
  await installJourneyApi(page, state);
  await page.goto("/");
  await settled(page);
  const video = page.video();
  setRawSeconds(state, 412);
  await page.getByRole("button", { name: "Journey", exact: true }).click({ force: true });
  await page.waitForTimeout(1_500);
  await page.keyboard.press("Escape");
  const world = page.locator(".pixi-scene");
  await expect(world).toHaveAttribute("data-zone-id", "paris-lanes", { timeout: 30_000 });
  const at = 432;
  state.scheduled = [{
    kind: "conversation",
    atActiveSecond: at,
    endsAtActiveSecond: at + conversationDurationSeconds(script.lines),
    occurrenceKey: "conversation:e2e-review",
    variant: script.id,
    source: "system",
  }];
  setRawSeconds(state, at + 0.1);
  const status = page.getByRole("status", { name: /Walking rule/ });
  await expect(status).toContainText("Talking with Inès", { timeout: 30_000 });
  const character = page.getByTestId("product-character-stage");
  await expect(character).toHaveAttribute("data-resident-state", "walk");
  const travelerFootX = Number(await character.getAttribute("data-foot-x"));
  expect(Math.abs(travelerFootX - 195)).toBeLessThan(12);
  await expect(page.locator(".dialogue-bubble")).toContainText("The canal suits your walking pace today.", { timeout: 10_000 });
  await expect(page.locator(".dialogue-bubble .eyebrow")).toHaveText("Inès");
  await expect(character).toHaveAttribute("data-character-state", "listen");
  await expect(character).toHaveAttribute("data-resident-state", "greet");
  await page.screenshot({ path: `${evidenceRoot}/conversation-resident-speaks-390.png` });
  await expect(page.locator(".dialogue-bubble")).toContainText("It is difficult to hurry beside this water.", { timeout: 8_000 });
  await expect(page.locator(".dialogue-bubble .eyebrow")).toHaveText("Traveler");
  await expect(character).toHaveAttribute("data-character-state", "greet");
  await expect(character).toHaveAttribute("data-resident-state", "listen");
  await page.screenshot({ path: `${evidenceRoot}/conversation-traveler-speaks-390.png` });
  await page.waitForTimeout(2_000);
  await context.close();
  if (video) await copyFile(await video.path(), `${evidenceRoot}/mobile-motion-review.webm`);
});
