import type { ZoneStage } from "../content/schema";
import {
  targetCharacterHeightPx,
  type CharacterHeightTargets,
} from "./stage-targets";

export const MAX_STAGE_IMAGE_SCALE = 1.6;

export type StageLayout = {
  imageScale: number;
  imageX: number;
  imageY: number;
  groundY: number;
  personHeightPx: number;
  pxPerMetre: number;
  requiredImageScale: number;
  characterImageScale: number;
  imageScaleClamped: boolean;
};

/** The painting scales to a stable actor size; stage fractions calibrate its perspective. */
export function stageLayout(
  viewportW: number, viewportH: number, imageW: number, imageH: number, stage: ZoneStage,
  targets: CharacterHeightTargets,
): StageLayout {
  if (![viewportW, viewportH, imageW, imageH].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError("Stage dimensions must be finite and positive");
  }
  const personHeightPx = targetCharacterHeightPx(viewportW, viewportH, targets);
  const requiredImageScale = personHeightPx / (stage.personHeightFrac * imageH);
  const imageScale = Math.min(requiredImageScale, MAX_STAGE_IMAGE_SCALE);
  const widthFitScale = viewportW / imageW;
  const groundY = viewportH * (viewportW <= 600 ? 0.80 : 0.86);
  return {
    imageScale,
    imageX: (viewportW - imageW * imageScale) / 2,
    imageY: groundY - stage.groundLineY * imageH * imageScale,
    groundY,
    personHeightPx,
    pxPerMetre: personHeightPx / 1.78,
    requiredImageScale,
    characterImageScale: requiredImageScale / widthFitScale,
    imageScaleClamped: requiredImageScale > MAX_STAGE_IMAGE_SCALE,
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

export function stageScaleWarning(packId: string, zoneId: string, layout: StageLayout) {
  if (!layout.imageScaleClamped) return null;
  return `pack ${packId}/${zoneId}: master composed too far away (needs imageScale ${layout.requiredImageScale.toFixed(3)}); regenerate at eye level`;
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
