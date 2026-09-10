import { expect, test } from "@playwright/test";
import { tbilisiCountryPackV1 } from "../../src/content/countries/tbilisi.v1";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`toon composition, contacts and quality at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/preview/characters");
    const actor = page.getByTestId("character-stage-3d");
    await expect(actor).toHaveAttribute("data-character-ready", "true", { timeout: 60_000 });
    await expect.poll(async () => Number(await actor.getAttribute("data-toon-materials"))).toBeGreaterThan(0);
    for (const zone of tbilisiCountryPackV1.route.zones) {
      await page.getByLabel("Review setting").selectOption(zone.id);
      const world = page.locator(".pixi-scene");
      await expect(world).toHaveAttribute("data-zone-id", zone.id, { timeout: 30_000 });
      await expect(actor).toHaveAttribute("data-zone-id", zone.id);
      await expect(world).toHaveAttribute("data-shadow-visible", "true");
      await expect.poll(async () => Number(await world.getAttribute("data-shadow-y")))
        .toBeCloseTo(viewport.height * (viewport.width <= 600 ? 0.8 : 0.86), 0);
      await expect.poll(async () => Number(await world.getAttribute("data-shadow-x")))
        .toBeCloseTo(viewport.width * 0.61, 0);
      const personHeight = Number(await actor.getAttribute("data-person-height"));
      expect(Number(await world.getAttribute("data-shadow-radius-x"))).toBeCloseTo(personHeight * 0.55 * 0.5, 0);
      const worldGrade = JSON.parse(await world.getAttribute("data-grade") ?? "null") as { exposure: number; tint: { r: number; g: number; b: number } };
      const actorGrade = JSON.parse(await actor.getAttribute("data-grade") ?? "null") as { exposure: number; tint: { r: number; g: number; b: number } };
      expect(worldGrade.exposure).toBeCloseTo(actorGrade.exposure, 3);
      expect(worldGrade.tint.r).toBeCloseTo(actorGrade.tint.r, 3);
      expect(worldGrade.tint.g).toBeCloseTo(actorGrade.tint.g, 3);
      expect(worldGrade.tint.b).toBeCloseTo(actorGrade.tint.b, 3);
      await expect(world).toHaveAttribute("data-scene-textures", new RegExp(zone.id));
    }
    await page.getByLabel("Review quality").selectOption("low");
    await expect(actor).toHaveAttribute("data-outline", "false");
    await expect(page.locator(".pixi-scene")).toHaveAttribute("data-shadow-visible", "true");
    await page.getByLabel("Review quality").selectOption("high");
    await expect(actor).toHaveAttribute("data-outline", "true");
    await page.getByLabel("Preview action").selectOption("encounter");
    await expect(actor).toHaveAttribute("data-resident-ready", "true", { timeout: 60_000 });
    await page.getByLabel("Animation timeline").fill("8");
    await expect(page.locator(".pixi-scene")).toHaveAttribute("data-shadow-visible", "true");
    await expect.poll(async () => Number(await page.locator(".pixi-scene").getAttribute("data-shadow-x")))
      .toBeCloseTo(viewport.width * (viewport.width <= 600 ? 0.34 : 0.43), 0);
    await page.screenshot({ path: testInfo.outputPath(`tbilisi-toon-${viewport.width}.png`) });
    await page.getByRole("button", { name: "Reload characters" }).click();
    await expect(actor).toHaveAttribute("data-character-ready", "true", { timeout: 60_000 });
    await expect(page.locator(".pixi-scene")).toHaveAttribute("data-shadow-visible", "true");
    expect(errors).toEqual([]);
  });
}
