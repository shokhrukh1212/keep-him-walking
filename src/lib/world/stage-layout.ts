import type { ZoneStage } from "../content/schema";

export type StageLayout = {
  imageScale: number;
  imageX: number;
  imageY: number;
  groundY: number;
  personHeightPx: number;
  pxPerMetre: number;
};

/** Image fractions become CSS pixels. Width-fit deliberately never crops vertically. */
export function stageLayout(
  viewportW: number, viewportH: number, imageW: number, imageH: number, stage: ZoneStage,
): StageLayout {
  if (![viewportW, viewportH, imageW, imageH].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError("Stage dimensions must be finite and positive");
  }
  const imageScale = viewportW / imageW;
  const groundY = viewportH * (viewportW <= 600 ? 0.80 : 0.86);
  const personHeightPx = stage.personHeightFrac * imageH * imageScale;
  return {
    imageScale,
    imageX: 0,
    imageY: groundY - stage.groundLineY * imageH * imageScale,
    groundY,
    personHeightPx,
    pxPerMetre: personHeightPx / 1.78,
  };
}

/** Only presentation changes: no route time, distance or authoritative inputs change. */
export function blendStageLayout(from: StageLayout, to: StageLayout, elapsedMs: number): StageLayout {
  const t = Math.min(1, Math.max(0, elapsedMs / 400));
  const weight = t * t * (3 - 2 * t);
  const groundY = from.groundY + (to.groundY - from.groundY) * weight;
  const personHeightPx = from.personHeightPx + (to.personHeightPx - from.personHeightPx) * weight;
  return { ...to, groundY, imageY: to.imageY + groundY - to.groundY, personHeightPx, pxPerMetre: personHeightPx / 1.78 };
}

/** Published by the world that actually drew this zone, never by a predicted zone. */
export type StageFrame = {
  assetVersion: string;
  zoneId: string;
  viewportW: number;
  viewportH: number;
  imageW: number;
  imageH: number;
  stage: ZoneStage;
  layout: StageLayout;
};
