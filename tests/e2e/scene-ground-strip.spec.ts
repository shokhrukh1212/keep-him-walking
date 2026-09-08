import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import { tbilisiCountryPackV1 } from "../../src/content/countries/tbilisi.v1";

/**
 * Regression guard for the ground-strip defect recorded in TECHNICAL.md §8.3:
 * `buildZone` used to tile five alpha-masked copies of `ground-1.webp` over the
 * panorama and scroll them at the character's walking rate.
 *
 * HOW THIS CHECK WAS DERIVED (all figures measured at 1440x900, the viewport this
 * spec pins, against `public/scenes/tbilisi/v1/zones/rustaveli-arrival/`):
 *
 * 1. Why these two rows. The retired strip was laid out as
 *      stripHeight = max(100, height * 0.19)          = 171 px
 *      y           = (height - 90) - stripHeight * 0.7 = 690.3 px
 *    so it covered y 690.3 -> 861.3, i.e. 0.767H -> 0.957H. Its canvas mask ramped
 *    alpha from 0 at its top edge to 1 at 45% of its height, so
 *      y = 0.79H (711 px) sat at alpha ~= 0.27  -- ghost blended over the panorama
 *      y = 0.95H (855 px) sat at alpha  = 1.00  -- ghost fully replacing it
 *    Both rows are clear of the ground-life blobs (y 760-793) and the motes (y < 630).
 *
 * 2. What separates the two builds. The panorama slides by
 *      -(renderedWidth - width) / durationActiveSeconds = -320 / 150 = -2.13 px/s,
 *    while the strip slid by `motion.distanceMetres * (layout.height / 1.78)`
 *      = 1.25 m/s * (531 px / 1.78 m) = 373 px/s -- 175x faster.
 *    So a raw same-pixel diff is useless (an 8 px slide of a photograph already
 *    yields a mean absolute difference of 20-50). Instead each sample row is
 *    matched against itself in a later frame over a +/-80 px shift search. One
 *    coherent panorama is a rigid translation of itself, so the search finds a
 *    near-zero residual, and every row agrees on the same shift. A composited
 *    strip does not: at alpha 1 it has translated far outside the search window,
 *    and at alpha 0.27 no single shift can fit two images moving at once.
 *
 * 3. Measured over two runs of the pre-fix renderer and four of the fixed one
 *    (`residual` = mean absolute channel difference at the best in-window shift):
 *
 *      row      | before the fix              | after the fix
 *      ---------|----------------------------|-----------------------
 *      y=0.79H  | residual 14.99 - 16.51     | residual 1.83 - 6.16
 *      y=0.95H  | residual 51.04 - 53.28     | residual 0.69 - 2.37
 *      shifts   | disagree by 87-91 px       | identical (-7 to -12 px)
 *      stage    | `generated:1200x216` + fallback.webp | fallback.webp only
 *
 *    Hence: residual < 10, shifts equal within 1 px, |shift| <= 40.
 */
const ZONE_ID = "rustaveli-arrival";
const PANORAMA_ASSET = `/scenes/tbilisi/v1/zones/${ZONE_ID}/fallback.webp`;
/** Zone 0 spans locomotion seconds 0-150; its only scheduled action (`wave`) sits at 15 s. */
const WALKING_RAW_SECONDS = 60;
const SAMPLE_ROWS = [0.79, 0.95] as const;
const DRIFT_WINDOW_MS = 1_600;
const SHIFT_SEARCH_PX = 80;
const MAX_ROW_RESIDUAL = 10;
const MAX_PANORAMA_SHIFT_PX = 40;

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

type Decoded = { data: Buffer; width: number; height: number; channels: number };

async function decode(png: Buffer): Promise<Decoded> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** Samples one row, kept clear of the character canvas anchored at 0.61 of the width. */
function row(frame: Decoded, fraction: number, offset = 0) {
  const y = Math.min(frame.height - 1, Math.round(frame.height * fraction));
  const from = Math.round(frame.width * 0.05) + offset;
  const to = Math.round(frame.width * 0.45) + offset;
  const samples: number[] = [];
  for (let x = from; x < to; x += 1) {
    const at = (y * frame.width + x) * frame.channels;
    samples.push(frame.data[at]!, frame.data[at + 1]!, frame.data[at + 2]!);
  }
  return samples;
}

function meanAbsoluteDifference(before: number[], after: number[]) {
  let total = 0;
  for (let index = 0; index < before.length; index += 1) {
    total += Math.abs(before[index]! - after[index]!);
  }
  return total / before.length;
}

/** The rigid horizontal translation that best explains one row between two frames. */
function bestShift(before: Decoded, after: Decoded, fraction: number) {
  const target = row(before, fraction);
  let best = { shift: 0, residual: Number.POSITIVE_INFINITY };
  for (let shift = -SHIFT_SEARCH_PX; shift <= SHIFT_SEARCH_PX; shift += 1) {
    const residual = meanAbsoluteDifference(target, row(after, fraction, shift));
    if (residual < best.residual) best = { shift, residual };
  }
  return best;
}

test("Tbilisi arrival draws one panorama with no ground strip over it", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const anchoredAt = Date.now();
  await page.route("**/api/**", async (route) => {
    const time = Date.now();
    const seconds = WALKING_RAW_SECONDS + (time - anchoredAt) / 1_000;
    const now = new Date(time).toISOString();
    if (route.request().url().includes("/bootstrap")) {
      const snapshot = offlineBootstrapSnapshot(new Date(time));
      await route.fulfill({ json: {
        ...snapshot,
        mode: "live",
        assets: tbilisiCountryPackV1,
        countryDay: {
          ...snapshot.countryDay,
          id: "test-day",
          countryCode: "GE",
          countryName: "Georgia",
          cityName: "Tbilisi",
          timeZone: "Asia/Tbilisi",
          scenePackId: tbilisiCountryPackV1.assetVersion,
        },
        refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
        presence: { status: "live", activeViewers: 1, ttlSeconds: 50 },
        route: { globalActiveSeconds: seconds, walking: true, authoritativeAt: now },
      } });
      return;
    }
    if (route.request().url().includes("/presence/heartbeat")) {
      await route.fulfill({ json: {
        countryDayId: "test-day", serverNow: now, realServerNow: now,
        activeViewers: 1, walking: true, globalSteps: 0, visitorActiveSeconds: 5,
        ttlSeconds: 50, nextHeartbeatInMs: 20_000,
        globalActiveSeconds: seconds, routeAuthoritativeAt: now,
      } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const stage = page.locator(".pixi-scene");
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", { timeout: 30_000 });
  await expect(stage).toHaveAttribute("data-character-state", "walk", { timeout: 30_000 });

  // 1. Structural: the only texture on the Pixi stage is the zone panorama. The
  //    inventory covers every Sprite reachable from app.stage; Assets-loaded
  //    textures carry their URL, browser-built ones (the retired canvas strip was
  //    one) are recorded as `generated:<w>x<h>`.
  await expect
    .poll(async () => await stage.getAttribute("data-scene-textures"), { timeout: 15_000 })
    .toContain(PANORAMA_ASSET);
  const drawn = ((await stage.getAttribute("data-scene-textures")) ?? "").split(" ").filter(Boolean);
  expect(drawn.filter((url) => url.includes("ground-"))).toEqual([]);
  expect(drawn.filter((url) => url.startsWith("generated:"))).toEqual([]);
  expect(drawn).toHaveLength(1);

  // 2. Isolate the world layer. The character canvas, colour grade and vignette
  //    composite above `.pixi-scene`, and the HUD is a sibling inside the same
  //    `.journey-shell` stacking context, so the screenshot must be re-stacked to
  //    contain Pixi output alone.
  await page.addStyleTag({ content: `
    .product-character-stage, .scene-grade, .scene-vignette { display: none !important; }
    .scene-stage { z-index: 2000 !important; }
  ` });

  const before = await decode(await page.screenshot());
  const groundPixelsBefore = Number(await stage.getAttribute("data-ground-pixels"));
  await page.waitForTimeout(DRIFT_WINDOW_MS);
  const after = await decode(await page.screenshot());
  const groundPixelsAfter = Number(await stage.getAttribute("data-ground-pixels"));

  // The walking clock must actually have advanced, or the drift check proves nothing.
  // The retired strip scrolled by exactly this quantity.
  // P2 calibrates the actor against doors in the painting, reducing px/metre.
  // Require substantial motion without assuming the former oversized traveler.
  expect(groundPixelsAfter - groundPixelsBefore).toBeGreaterThan(100);

  const shifts = SAMPLE_ROWS.map((fraction) => {
    const measured = bestShift(before, after, fraction);
    testInfo.annotations.push({
      type: "row-shift",
      description: `y=${fraction}H shift=${measured.shift}px residual=${measured.residual.toFixed(2)}`,
    });
    expect(
      measured.residual,
      `y=${fraction}H must be a rigid translation of the panorama, not a composited strip`,
    ).toBeLessThan(MAX_ROW_RESIDUAL);
    expect(
      Math.abs(measured.shift),
      `y=${fraction}H must slide at the panorama's rate, not the walking rate`,
    ).toBeLessThanOrEqual(MAX_PANORAMA_SHIFT_PX);
    return measured.shift;
  });

  // Both rows belong to one painting, so they must move together.
  expect(Math.abs(shifts[0]! - shifts[1]!)).toBeLessThanOrEqual(1);

  expect(errors).toEqual([]);
});
