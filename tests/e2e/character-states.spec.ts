import { expect, test } from "@playwright/test";
import { CLIP_SPECS } from "../../src/lib/characters/manifest";

test("character review renders every manifest state with explicit missing badges", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => {
    const expectedUninstalledV3 = response.status() === 404 && response.url().includes("/characters/v3/");
    if (response.status() >= 400 && !expectedUninstalledV3) errors.push(`${response.status()} ${response.url()}`);
  });
  // Web-vitals has its own remote-backed rate limit and is unrelated to character review.
  await page.route("**/api/observability/vitals", (route) => route.fulfill({ status: 204 }));
  await page.goto("/preview/characters");
  const stage = page.getByTestId("character-stage-3d");
  await expect(stage).toHaveAttribute("data-character-ready", "true", { timeout: 60_000 });
  await expect(page.getByTestId("manifest-clip-list").locator("li"))
    .toHaveCount(Object.keys(CLIP_SPECS).length);

  for (const clip of Object.keys(CLIP_SPECS)) {
    await page.getByLabel("Preview action").selectOption(clip);
    await expect(stage).toHaveAttribute("data-clip", clip);
  }
  expect(errors).toEqual([]);
});
