import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installPrelaunchApi, installPreviewRecorder, prelaunchApi, previewLog, speechSpans } from "./helpers/prelaunch-api";

// A short proof recording of the welcome: the caption and the talk take start and stop together.
test("records the first welcome and its return to idle", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installPrelaunchApi(page, prelaunchApi());
  await installPreviewRecorder(page);
  await page.goto("/");
  const caption = page.getByTestId("preview-caption");
  await expect(page.getByTestId("product-character-stage")).toHaveAttribute("data-character-ready", "true", { timeout: 90_000 });
  await expect(caption).toHaveAttribute("data-speaking", "true", { timeout: 20_000 });
  await expect(caption).toHaveAttribute("data-speaking", "false", { timeout: 20_000 });
  await page.waitForTimeout(3_000);
  const log = await previewLog(page);
  await writeFile(testInfo.outputPath("preview-log.json"), `${JSON.stringify({
    characterReadyAt: log.characterReadyAt,
    spans: speechSpans(log.events),
    events: log.events,
  }, null, 2)}\n`);
});
