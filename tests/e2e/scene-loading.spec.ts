import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page, type Response } from "@playwright/test";
import { evidenceRoot, installJourneyApi, sampleFrames, setRawSeconds, settled, type JourneyState } from "./helpers/journey-api";

const PLACES = ["paris-arrival", "paris-lanes", "paris-market", "paris-cafe", "paris-landmark"];
const VISIT_SECONDS = 420;
const LOOP_SECONDS = VISIT_SECONDS * PLACES.length;

test.use({ deviceScaleFactor: 1.5 });

function placeOf(url: string): string | null {
  return /\/scenes\/paris\/v2\/places\/([^/]+)\//.exec(url)?.[1] ?? null;
}

function recordSceneTraffic(page: Page) {
  const requests: string[] = [];
  const transfers: Array<{ place: string | null; file: string; bytes: number; status: number }> = [];
  const pending: Promise<void>[] = [];
  page.on("request", (request) => {
    if (placeOf(request.url())) requests.push(request.url());
  });
  page.on("response", (response: Response) => {
    if (!placeOf(response.url())) return;
    pending.push(response.request().sizes().then((sizes) => {
      transfers.push({
        place: placeOf(response.url()),
        file: response.url().split("/").at(-1) ?? "",
        bytes: sizes.responseBodySize,
        status: response.status(),
      });
    }).catch(() => undefined));
  });
  return { requests, transfers, settle: () => Promise.all(pending) };
}

async function worldNumbers(page: Page) {
  const world = page.locator(".pixi-scene");
  return {
    placesLoaded: Number(await world.getAttribute("data-scene-places-loaded")),
    texturesHeld: Number(await world.getAttribute("data-scene-textures-held")),
    textureBytes: Number(await world.getAttribute("data-scene-texture-bytes")),
    variant: await world.getAttribute("data-scene-variant"),
  };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`fetches only the current and next place, bounded over three loops at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(420_000);
    await mkdir(evidenceRoot, { recursive: true });
    const traffic = recordSceneTraffic(page);
    const state: JourneyState = { rawSeconds: 60 };
    await installJourneyApi(page, state);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await settled(page);
    const world = page.locator(".pixi-scene");
    await expect(world).toHaveAttribute("data-zone-id", "paris-arrival");
    await expect(world).toHaveAttribute("data-scene-asset-state", "ready");
    await page.waitForTimeout(2_000);
    await traffic.settle();
    const coldPlaces = [...new Set(traffic.requests.map(placeOf))];
    // A cold visit fetches one place; the poster and the world share its rendition.
    expect(coldPlaces).toEqual(["paris-arrival"]);
    const cold = { ...(await worldNumbers(page)), requests: traffic.requests.length, files: [...new Set(traffic.requests.map((url) => url.split("/").at(-1)))] };

    const steps: Array<Record<string, unknown>> = [];
    let transitionFrames = null;
    for (let loop = 0; loop < 3; loop += 1) {
      for (let index = 0; index < PLACES.length; index += 1) {
        const start = loop * LOOP_SECONDS + index * VISIT_SECONDS;
        const from = PLACES[index]!;
        const to = PLACES[(index + 1) % PLACES.length]!;
        const requestsBefore = traffic.requests.length;
        // 20 walking seconds before the boundary the next place is fetched and uploaded.
        setRawSeconds(state, start + VISIT_SECONDS - 20);
        await expect(world).toHaveAttribute("data-scene-next-zone-id", to, { timeout: 30_000 });
        const crossing = async () => {
          setRawSeconds(state, start + VISIT_SECONDS + 1);
          await expect(world).toHaveAttribute("data-zone-id", to, { timeout: 30_000 });
        };
        if (loop === 0 && index === 0) transitionFrames = await sampleFrames(page, 4_000, crossing);
        else await crossing();
        await page.waitForTimeout(1_500);
        const numbers = await worldNumbers(page);
        const fetched = [...new Set(traffic.requests.slice(requestsBefore).map(placeOf))];
        steps.push({ loop, from, to, ...numbers, newRequests: traffic.requests.length - requestsBefore, fetchedPlaces: fetched });
        expect(numbers.placesLoaded).toBeLessThanOrEqual(2);
        expect(numbers.texturesHeld).toBeLessThanOrEqual(8);
        expect(fetched.every((place) => place === to || place === from)).toBe(true);
      }
    }
    await traffic.settle();
    const firstLoopBytes = new Map<string, number>();
    for (const transfer of traffic.transfers) {
      if (!transfer.place) continue;
      firstLoopBytes.set(transfer.file, Math.max(firstLoopBytes.get(transfer.file) ?? 0, transfer.bytes));
    }
    const bytesByPlace: Record<string, number> = {};
    for (const [file, bytes] of firstLoopBytes) {
      const place = traffic.transfers.find((transfer) => transfer.file === file)?.place ?? "unknown";
      bytesByPlace[place] = (bytesByPlace[place] ?? 0) + bytes;
    }
    const maxHeld = Math.max(...steps.map((step) => Number(step.texturesHeld)));
    const maxBytes = Math.max(...steps.map((step) => Number(step.textureBytes)));
    expect(Number(steps.at(-1)!.textureBytes)).toBeLessThanOrEqual(maxBytes);
    await writeFile(`${evidenceRoot}/scene-loading-${viewport.width}.json`, `${JSON.stringify({
      viewport,
      deviceScaleFactor: 1.5,
      cold,
      transferBytesByPlace: bytesByPlace,
      distinctFiles: firstLoopBytes.size,
      totalRequests: traffic.requests.length,
      maxTexturesHeld: maxHeld,
      maxDecodedTextureBytes: maxBytes,
      firstTransitionFrames: transitionFrames,
      steps,
    }, null, 2)}\n`);
  });
}

test("a painting that fails keeps the last one on screen, then recovers without a reset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The recovery contract runs once");
  test.setTimeout(180_000);
  await mkdir(evidenceRoot, { recursive: true });
  let blocked = true;
  const state: JourneyState = { rawSeconds: 380 };
  await installJourneyApi(page, state);
  await page.route("**/scenes/paris/v2/places/paris-lanes/**", (route) => blocked ? route.abort("failed") : route.continue());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await settled(page);
  const world = page.locator(".pixi-scene");
  const status = page.getByRole("status", { name: /Walking rule/ });
  await expect(world).toHaveAttribute("data-zone-id", "paris-arrival");

  setRawSeconds(state, 430);
  await expect(world).toHaveAttribute("data-scene-asset-state", "retrying", { timeout: 30_000 });
  // The last good painting stays, and the status line names what is on screen.
  await expect(world).toHaveAttribute("data-zone-id", "paris-arrival");
  await expect(status).toContainText("Gare du Nord");
  await expect(page.getByTestId("product-character-stage")).toHaveAttribute("data-character-ready", "true");
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi");
  await page.screenshot({ path: `${evidenceRoot}/painting-retry-keeps-last.png` });
  const retries = Number(await world.getAttribute("data-scene-retry-attempts"));
  expect(retries).toBeGreaterThanOrEqual(1);

  blocked = false;
  await expect(world).toHaveAttribute("data-zone-id", "paris-lanes", { timeout: 60_000 });
  await expect(world).toHaveAttribute("data-scene-asset-state", "ready");
  await expect(status).toContainText("Canal Saint-Martin");
  const mounts = await world.getAttribute("data-mount-count");
  await page.waitForTimeout(1_000);
  expect(await world.getAttribute("data-mount-count")).toBe(mounts);
});

test("with no painting at all he walks on a neutral street until one arrives", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The recovery contract runs once");
  test.setTimeout(180_000);
  await mkdir(evidenceRoot, { recursive: true });
  let blocked = true;
  const state: JourneyState = { rawSeconds: 90 };
  await installJourneyApi(page, state);
  await page.route("**/scenes/paris/v2/places/paris-arrival/**", (route) => blocked ? route.abort("failed") : route.continue());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await settled(page);
  const world = page.locator(".pixi-scene");
  await expect(world).toHaveAttribute("data-scene-asset-state", "fallback", { timeout: 30_000 });
  await expect(world).not.toHaveAttribute("data-zone-id", /.+/);
  const status = page.getByRole("status", { name: /Walking rule/ });
  await expect(status).toContainText("Walking");
  await expect(status).not.toContainText("Gare du Nord");
  await page.screenshot({ path: `${evidenceRoot}/painting-neutral-fallback-390.png` });

  blocked = false;
  await expect(world).toHaveAttribute("data-zone-id", "paris-arrival", { timeout: 60_000 });
  await expect(status).toContainText("Gare du Nord");
});
