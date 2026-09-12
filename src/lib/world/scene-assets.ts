import type { RouteZone, SceneVariant } from "@/lib/content/schema";
import { stageLayout } from "./stage-layout";
import { CHARACTER_HEIGHT_TARGETS } from "./stage-targets";
import type { ScenePosition } from "./types";

/**
 * Which rendition of a place a viewer downloads and decodes. Choices depend only
 * on the viewport and the pinned manifest, and layout always uses the nominal
 * full-painting size, so a smaller rendition never moves the painting, the
 * pavement or the traveler.
 */

/** Wider textures fail to upload on some mobile GPUs. */
export const MAX_SAFE_TEXTURE_SIZE = 4_096;
/** The next place is fetched and uploaded this many active-walking seconds before it appears. */
export const NEXT_PLACE_PREPARE_SECONDS = 45;

export type RenditionChoice = {
  url: string;
  width: number;
  height: number;
  crop: SceneVariant["crop"];
  /** Where the rendition sits inside the nominal painting, in nominal pixels. */
  nominalLeft: number;
  nominalWidth: number;
};

export type PlaceRenditions = {
  /** Null for packs built before manifests, whose texture size is the layout size. */
  nominal: { width: number; height: number } | null;
  city: RenditionChoice;
  sky: RenditionChoice | null;
  ground: RenditionChoice | null;
  night: RenditionChoice | null;
};

export type RenditionRequest = {
  viewportWidth: number;
  viewportHeight: number;
  /** Device pixels the renderer draws per CSS pixel. */
  resolution: number;
  /** CSS pixels per nominal painting pixel, from stageLayout. */
  imageScale: number;
  /** CSS height of the pavement band the ground tile fills. */
  groundHeightPx: number;
  maxTextureSize?: number;
};

function coveredWidth(variant: SceneVariant, nominalWidth: number, nominalHeight: number): number {
  return variant.crop === "center"
    ? Math.min(nominalWidth, variant.width * nominalHeight / variant.height)
    : nominalWidth;
}

function choice(variant: SceneVariant, nominalWidth: number, nominalHeight: number): RenditionChoice {
  const width = coveredWidth(variant, nominalWidth, nominalHeight);
  return {
    url: variant.url,
    width: variant.width,
    height: variant.height,
    crop: variant.crop,
    nominalLeft: (nominalWidth - width) / 2,
    nominalWidth: width,
  };
}

function withinGpuLimit(variants: readonly SceneVariant[], request: RenditionRequest): SceneVariant[] {
  const limit = request.maxTextureSize ?? MAX_SAFE_TEXTURE_SIZE;
  const usable = variants.filter((variant) => variant.width <= limit && variant.height <= limit);
  return usable.length > 0 ? usable : [...variants];
}

const area = (variant: SceneVariant) => variant.width * variant.height;

/**
 * The smallest painting that both covers everything the viewport can show and
 * has enough pixels for the drawn size. A portrait screen gets the centre crop.
 */
export function choosePainting(
  variants: readonly SceneVariant[],
  nominalWidth: number,
  nominalHeight: number,
  request: RenditionRequest,
): RenditionChoice | null {
  if (variants.length === 0) return null;
  const pool = withinGpuLimit(variants, request);
  const scale = Math.max(1e-6, Number.isFinite(request.imageScale) ? request.imageScale : 1);
  const visible = Math.min(nominalWidth, request.viewportWidth / scale);
  // A little margin so rounding and a scrollbar never expose a cropped edge.
  const covering = pool.filter((variant) => coveredWidth(variant, nominalWidth, nominalHeight) >= Math.min(nominalWidth, visible * 1.04 + 2));
  const candidates = covering.length > 0 ? covering : pool.filter((variant) => variant.crop === "full");
  const ordered = (candidates.length > 0 ? candidates : pool);
  const density = scale * Math.max(1, request.resolution);
  const sharpEnough = ordered.filter((variant) => variant.height / nominalHeight >= density * 0.9);
  const chosen = sharpEnough.length > 0
    ? [...sharpEnough].sort((left, right) => area(left) - area(right))[0]!
    : [...ordered].sort((left, right) => right.height - left.height || area(left) - area(right))[0]!;
  return choice(chosen, nominalWidth, nominalHeight);
}

/** The soft sky plate is blurred, so half its drawn resolution is plenty. */
export function chooseSky(variants: readonly SceneVariant[], request: RenditionRequest): RenditionChoice | null {
  if (variants.length === 0) return null;
  const pool = withinGpuLimit(variants, request);
  const coverWidth = Math.max(request.viewportWidth, request.viewportHeight * 16 / 9) * Math.max(1, request.resolution);
  const enough = pool.filter((variant) => variant.width >= coverWidth / 2);
  const chosen = enough.length > 0
    ? [...enough].sort((left, right) => left.width - right.width)[0]!
    : [...pool].sort((left, right) => right.width - left.width)[0]!;
  return { url: chosen.url, width: chosen.width, height: chosen.height, crop: chosen.crop, nominalLeft: 0, nominalWidth: chosen.width };
}

/** The pavement tile may be upscaled slightly; it is texture, not detail. */
export function chooseGround(variants: readonly SceneVariant[], request: RenditionRequest): RenditionChoice | null {
  if (variants.length === 0) return null;
  const pool = withinGpuLimit(variants, request);
  const needed = Math.max(1, request.groundHeightPx) * Math.max(1, request.resolution) * 0.8;
  const enough = pool.filter((variant) => variant.height >= needed);
  const chosen = enough.length > 0
    ? [...enough].sort((left, right) => left.height - right.height)[0]!
    : [...pool].sort((left, right) => right.height - left.height)[0]!;
  return { url: chosen.url, width: chosen.width, height: chosen.height, crop: chosen.crop, nominalLeft: 0, nominalWidth: chosen.width };
}

function legacyChoice(url: string): RenditionChoice {
  return { url, width: 0, height: 0, crop: "full", nominalLeft: 0, nominalWidth: 0 };
}

/**
 * What a viewport of this size needs from a place. The Pixi world and the static
 * poster both call this with the same numbers, so they ask for the same file.
 */
export function renditionRequestFor(
  zone: RouteZone,
  viewportWidth: number,
  viewportHeight: number,
  resolution: number,
  maxTextureSize?: number,
): RenditionRequest {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const nominalWidth = zone.variants?.nominalWidth ?? 3_600;
  const nominalHeight = zone.variants?.nominalHeight ?? 1_200;
  const layout = stageLayout(width, height, nominalWidth, nominalHeight, zone.stage, CHARACTER_HEIGHT_TARGETS);
  const groundHeightFrac = zone.continuousScene?.groundHeightFrac ?? 0.22;
  return {
    viewportWidth: width,
    viewportHeight: height,
    resolution: Math.max(1, resolution),
    imageScale: layout.imageScale,
    groundHeightPx: Math.max(height - layout.groundY, height * groundHeightFrac),
    maxTextureSize,
  };
}

export function placeRenditions(zone: RouteZone, request: RenditionRequest): PlaceRenditions {
  const variants = zone.variants;
  if (!variants) {
    return {
      nominal: null,
      city: legacyChoice(zone.continuousScene?.cityUrl ?? zone.fallbackUrl),
      sky: zone.continuousScene ? legacyChoice(zone.continuousScene.skyUrl) : null,
      ground: zone.continuousScene ? legacyChoice(zone.continuousScene.groundUrl) : null,
      night: zone.nightUrl ? legacyChoice(zone.nightUrl) : null,
    };
  }
  const nominal = { width: variants.nominalWidth, height: variants.nominalHeight };
  return {
    nominal,
    city: choosePainting(variants.city, nominal.width, nominal.height, request)!,
    sky: chooseSky(variants.sky, request),
    ground: chooseGround(variants.ground, request),
    night: choosePainting(variants.night, nominal.width, nominal.height, request),
  };
}

/** Upgrade on resize when the new viewport needs more pixels; never thrash down mid-visit. */
export function shouldReplaceRendition(current: RenditionChoice | null, next: RenditionChoice | null): boolean {
  if (!next) return false;
  if (!current) return true;
  if (current.url === next.url) return false;
  return next.height > current.height || next.nominalWidth > current.nominalWidth;
}

export function decodedBytes(renditions: readonly (RenditionChoice | null)[]): number {
  return renditions.reduce((total, item) => total + (item ? item.width * item.height * 4 : 0), 0);
}

/** The current place, plus the next one only in the last moments before it appears. */
export function placeLoadPlan(
  position: Pick<ScenePosition, "zoneIndex" | "nextZoneIndex" | "secondsToNextVisit">,
  prepareSeconds = NEXT_PLACE_PREPARE_SECONDS,
): { current: number; next: number | null } {
  const next = position.nextZoneIndex !== position.zoneIndex && position.secondsToNextVisit <= prepareSeconds
    ? position.nextZoneIndex
    : null;
  return { current: position.zoneIndex, next };
}
