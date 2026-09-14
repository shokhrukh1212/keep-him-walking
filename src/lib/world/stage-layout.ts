import type { ZoneStage } from "../content/schema";
import {
  targetCharacterHeightPx,
  type CharacterHeightTargets,
} from "./stage-targets";

export const MAX_STAGE_IMAGE_SCALE = 1.6;
export const STAGE_PANEL_GAP_PX = 16;

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

/**
 * Pans one identifiable painting from its left edge to its right edge exactly
 * once. It never wraps; a painting narrower than the viewport is simply centred.
 */
export function boundedPanoramaLayout(
  textureSpan: number,
  viewportWidth: number,
  progress: number,
  reducedMotion = false,
) {
  if (![textureSpan, viewportWidth].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Panorama dimensions must be finite and positive");
  }
  const availablePan = Math.max(0, textureSpan - viewportWidth);
  const routeProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const offset = reducedMotion ? availablePan / 2 : availablePan * routeProgress;
  return {
    offset,
    x: textureSpan >= viewportWidth ? -offset : (viewportWidth - textureSpan) / 2,
  };
}

/** The painting scales to a stable actor size; stage fractions calibrate its perspective. */
export function stageLayout(
  viewportW: number, viewportH: number, imageW: number, imageH: number, stage: ZoneStage,
  targets: CharacterHeightTargets,
  bottomInsetPx = 0,
  /** The place lays its own pavement tile from the ground line to the bottom of the screen. */
  pavementLayer = false,
): StageLayout {
  if (![viewportW, viewportH, imageW, imageH].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError("Stage dimensions must be finite and positive");
  }
  const safeBottomInset = Math.min(
    viewportH - STAGE_PANEL_GAP_PX,
    Math.max(0, Number.isFinite(bottomInsetPx) ? bottomInsetPx : 0),
  );
  const naturalGroundY = viewportH * (viewportW <= 600 ? 0.80 : 0.86);
  const groundY = Math.min(naturalGroundY, viewportH - safeBottomInset - STAGE_PANEL_GAP_PX);
  const personHeightPx = Math.min(
    targetCharacterHeightPx(viewportW, viewportH, targets),
    Math.max(1, groundY - STAGE_PANEL_GAP_PX),
  );
  const requiredImageScale = personHeightPx / (stage.personHeightFrac * imageH);
  // The painting is stationary and must cover the measured stage. Character
  // perspective still supplies the preferred scale, but can never expose a
  // blue/transparent strip at a narrow or short aspect ratio. A footer lifts the ground
  // line; the pavement tile fills the taller band below it, so only a place without
  // one has to enlarge its painting until the painting reaches the bottom edge.
  const coverScale = bottomInsetPx > 0
    ? Math.max(
        viewportW / imageW,
        groundY / (stage.groundLineY * imageH),
        pavementLayer ? 0 : (viewportH - groundY) / ((1 - stage.groundLineY) * imageH),
      )
    : Math.max(viewportW / imageW, viewportH / imageH);
  const imageScale = Math.max(coverScale, Math.min(requiredImageScale, MAX_STAGE_IMAGE_SCALE));
  const widthFitScale = viewportW / imageW;
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

/**
 * Pixi snaps its screen to whole device pixels: at 150 % display scaling a 1333 × 811 host
 * publishes 1333.33 × 811.33. That error is at most half a device pixel, which is two CSS
 * pixels at the browser's 25 % minimum zoom.
 */
export const STAGE_FRAME_TOLERANCE_PX = 2;

/** Whether a published world frame describes this host's viewport, allowing for that rounding. */
export function frameFitsViewport(
  frame: Pick<StageFrame, "viewportW" | "viewportH">, width: number, height: number,
): boolean {
  return Math.abs(frame.viewportW - width) <= STAGE_FRAME_TOLERANCE_PX
    && Math.abs(frame.viewportH - height) <= STAGE_FRAME_TOLERANCE_PX;
}
