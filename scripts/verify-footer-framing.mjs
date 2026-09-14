import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const target = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("docs/launch-finalization/evidence/footer-framing");
const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900, screenshot: true },
  { name: "mobile-430x932", width: 430, height: 932 },
  { name: "mobile-390x844", width: 390, height: 844, screenshot: true },
  { name: "mobile-375x812", width: 375, height: 812 },
  { name: "mobile-320x667", width: 320, height: 667 },
  { name: "mobile-320x568", width: 320, height: 568 },
  { name: "landscape-844x390", width: 844, height: 390, screenshot: true },
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.locator(".journey-footer-region").waitFor();
  await page.locator(".product-character-stage[data-foot-y]").waitFor({ timeout: 20_000 });
  await page.locator(".connection-banner:not(.offline)").waitFor({ state: "hidden", timeout: 12_000 }).catch(() => {});
  const mountsWhenReady = Number(await page.locator(".product-character-stage").getAttribute("data-mount-count"));
  await page.waitForTimeout(1_000);
  const metrics = await page.evaluate(() => {
    const footer = document.querySelector(".journey-footer-region");
    const panel = document.querySelector(".journey-progress-panel");
    const actor = document.querySelector(".product-character-stage");
    if (!(footer instanceof HTMLElement) || !(panel instanceof HTMLElement) || !(actor instanceof HTMLElement)) {
      throw new Error("Landing footer or character stage is unavailable");
    }
    const footerBox = footer.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const dialogue = document.querySelector(".dialogue-bubble");
    const dialogueBox = dialogue instanceof HTMLElement ? dialogue.getBoundingClientRect() : null;
    const obstructionTop = innerWidth <= 600 && dialogueBox
      ? Math.min(footerBox.top, dialogueBox.top)
      : footerBox.top;
    const footY = Number(actor.dataset.footY);
    const personHeight = Number(actor.dataset.personHeight);
    return {
      footerTop: footerBox.top,
      footerHeight: footerBox.height,
      measuredInset: Number(footer.dataset.bottomInset),
      sceneInset: Number(footer.dataset.sceneBottomInset),
      panel: { x: panelBox.x, y: panelBox.y, width: panelBox.width, height: panelBox.height },
      dialogue: dialogueBox ? { y: dialogueBox.y, height: dialogueBox.height } : null,
      actor: { footY, top: footY - personHeight, height: personHeight },
      feetToObstructionGap: obstructionTop - footY,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      characterMounts: Number(actor.dataset.mountCount),
    };
  });
  if (metrics.feetToObstructionGap < 15) {
    throw new Error(`${viewport.name}: feet gap ${metrics.feetToObstructionGap}px`);
  }
  if (metrics.horizontalOverflow > 0) throw new Error(`${viewport.name}: horizontal overflow ${metrics.horizontalOverflow}px`);
  if (metrics.characterMounts !== mountsWhenReady) {
    throw new Error(`${viewport.name}: character remounted after footer measurement (${mountsWhenReady} -> ${metrics.characterMounts})`);
  }
  if (viewport.screenshot) await page.screenshot({ path: path.join(output, `${viewport.name}.png`) });
  results.push({ viewport: `${viewport.width}x${viewport.height}`, ...metrics });
  await page.close();
}

await browser.close();
await writeFile(path.join(output, "metrics.json"), `${JSON.stringify(results, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
