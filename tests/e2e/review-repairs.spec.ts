import { expect, test } from "@playwright/test";
import sharp from "sharp";

// The sign-in test uses a real local secret: never record its request in a trace.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("changing quality leaves the idle silhouette within three pixels", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/observability/vitals", (route) => route.fulfill({ status: 204 }));
  await page.goto("/preview/characters");
  const stage = page.getByTestId("character-stage-3d");
  await expect(stage).toHaveAttribute("data-character-ready", "true");
  const bounds = async () => {
    const png = await stage.screenshot();
    // The studio is uniform grey. Inspect only the character's half of the image.
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const background = [data[0], data[1], data[2]];
    let top = info.height, bottom = 0, left = info.width, right = 0;
    for (let y = 20; y < info.height - 80; y++) for (let x = 500; x < info.width - 50; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (background.some((value, channel) => Math.abs(data[offset + channel] - value) > 35)) {
        top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
      }
    }
    return { top, bottom, left, right };
  };
  await page.getByLabel("Review quality").selectOption("low");
  const low = await bounds();
  await page.getByLabel("Review quality").selectOption("high");
  const high = await bounds();
  expect(low.bottom - low.top).toBeGreaterThan(400);
  for (const edge of ["top", "bottom", "left", "right"] as const) expect(Math.abs(high[edge] - low[edge])).toBeLessThanOrEqual(3);
  await page.screenshot({ path: testInfo.outputPath("character-quality.png") });
  await page.getByLabel("Studio lighting").selectOption("23");
  await expect(stage).toHaveAttribute("data-grade", /0.62/);
  await page.screenshot({ path: testInfo.outputPath("character-night.png") });
  const controls = page.getByLabel("Character review controls");
  expect(await controls.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("the full map scrolls to its statistics and contains live vote branches", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/map");
  await expect(page.getByTestId("journey-map-full")).toBeVisible();
  await expect(page.locator(".map-candidate")).toHaveCount(2);
  await page.mouse.move(1150, 500);
  await page.mouse.wheel(0, 1600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect(page.getByLabel("Season map statistics")).toBeInViewport();
});

test("the live day loads and the finished Day 1 recap is available", async ({ request, page }, testInfo) => {
  const bootstrap = await request.get("/api/bootstrap");
  expect(bootstrap.status()).toBe(200);
  expect((await bootstrap.json()).mode).toBe("live");
  await page.goto("/");
  await expect(page.getByTestId("product-character-stage")).toHaveAttribute("data-character-ready", "true", { timeout: 60_000 });
  await expect(page.locator(".connection-banner")).toHaveCount(0);
  const introduction = page.getByRole("button", { name: "Dismiss introduction" });
  await introduction.click({ timeout: 6_000 }).catch(() => undefined);
  await expect(introduction).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("live-night.png") });
  const recap = await page.goto("/day/1");
  expect(recap?.status()).toBe(200);
  await expect(page.locator(".outcome-stamp")).toBeVisible();
  await page.getByRole("heading", { name: "The handoff" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "The handoff" })).toBeInViewport();
  expect((await request.get("/api/og/recap/1")).headers()["content-type"]).toContain("image/png");
});

test("a server 503 is identified as unavailable service, not lost internet", async ({ page }) => {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ status: 503, json: { code: "NO_ACTIVE_DAY" } }));
  await page.goto("/");
  await expect(page.locator(".connection-banner")).toContainText("No journey day is active");
  await expect(page.locator(".traveler-state")).toContainText("Preview only · waiting for the live journey");
});

test.describe("private sign-in", () => {
  test("opens the sign-in form and authenticates into the saved post kit", async ({ page, request }) => {
    process.loadEnvFile(".env.local");
    const secret = process.env.ADMIN_ACCESS_SECRET;
    if (!secret) throw new Error("Configure ADMIN_ACCESS_SECRET before the manual-review acceptance suite.");
    expect((await request.get("/admin")).status()).toBe(404);
    await page.goto("/api/admin/session");
    await expect(page.getByRole("heading", { name: "Admin sign-in" })).toBeVisible();
    await page.getByLabel("Admin access secret").fill(secret);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole("link", { name: "Day 1", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Day 1");
    await expect(page.locator(".postkit-list")).toBeVisible();
  });
});
