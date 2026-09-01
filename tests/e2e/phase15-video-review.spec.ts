import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";

const recordings = [
  {
    name: "desktop",
    width: 1_440,
    height: 900,
    file: "artifacts/phase15-motion-v3/phase15-record-Phase-1-5-visual-motion-proof-desktop-proof/video.webm",
  },
  {
    name: "mobile",
    width: 390,
    height: 844,
    file: "artifacts/phase15-motion-v3/phase15-record-Phase-1-5-visual-motion-proof-mobile-proof/video.webm",
  },
];

test("extracts checkpoints from the recorded Phase 1.5 proof", async ({ page }) => {
  test.skip(process.env.REVIEW_PHASE15_VIDEO !== "1", "Run only when reviewing final recordings");
  test.setTimeout(90_000);
  const evidenceRoot = "artifacts/phase15-video-review-v3";
  await mkdir(evidenceRoot, { recursive: true });

  for (const recording of recordings) {
    await page.setViewportSize({ width: recording.width, height: recording.height });
    const videoBytes = await readFile(path.resolve(recording.file));
    const videoUrl = `data:video/webm;base64,${videoBytes.toString("base64")}`;
    await page.setContent(`
      <style>html,body{margin:0;background:#101b24;overflow:hidden}video{display:none}canvas{width:100vw;height:100vh;object-fit:contain}</style>
      <video src="${videoUrl}" muted preload="auto"></video><canvas></canvas>
    `);
    const video = page.locator("video");
    await video.evaluate((element: HTMLVideoElement) => new Promise<void>((resolve, reject) => {
      if (element.readyState >= 1) return resolve();
      element.addEventListener("loadedmetadata", () => resolve(), { once: true });
      element.addEventListener("error", () => reject(new Error("Video failed to load")), { once: true });
    }));
    for (const second of [8, 18, 24, 34, 42, 52, 64]) {
      await video.evaluate((element: HTMLVideoElement, target: number) => new Promise<void>((resolve) => {
        element.addEventListener("seeked", () => resolve(), { once: true });
        element.currentTime = Math.min(target, Math.max(0, element.duration - 0.2));
      }), second);
      await page.waitForTimeout(650);
      await video.evaluate((element: HTMLVideoElement) => {
        const canvas = document.querySelector("canvas");
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas unavailable");
        canvas.width = element.videoWidth;
        canvas.height = element.videoHeight;
        canvas.getContext("2d")?.drawImage(element, 0, 0);
      });
      await page.screenshot({ path: `${evidenceRoot}/${recording.name}-${second}s.png` });
    }
  }
});
