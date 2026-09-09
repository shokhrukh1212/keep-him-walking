export const DAY_PHOTO_WIDTH = 1_280;
export const DAY_PHOTO_HEIGHT = 720;

export type CropRect = { x: number; y: number; width: number; height: number };

/**
 * The 16:9 window to cut out of the composed frame, centred on him and clamped
 * so the crop never runs off the canvas. Pure so the framing can be tested
 * without a browser.
 */
export function photoCropRect(
  canvasWidth: number,
  canvasHeight: number,
  focusX: number,
  focusY: number,
  aspect = DAY_PHOTO_WIDTH / DAY_PHOTO_HEIGHT,
): CropRect {
  const width = Math.max(1, Math.floor(canvasWidth));
  const height = Math.max(1, Math.floor(canvasHeight));
  // Take the largest 16:9 rectangle the canvas can supply.
  let cropWidth = width;
  let cropHeight = Math.round(cropWidth / aspect);
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = Math.round(cropHeight * aspect);
  }
  const safeFocusX = Number.isFinite(focusX) ? focusX : width / 2;
  const safeFocusY = Number.isFinite(focusY) ? focusY : height / 2;
  const x = Math.min(Math.max(0, Math.round(safeFocusX - cropWidth / 2)), width - cropWidth);
  const y = Math.min(Math.max(0, Math.round(safeFocusY - cropHeight / 2)), height - cropHeight);
  return { x, y, width: cropWidth, height: cropHeight };
}

/**
 * Composes the painted world and the character canvas into one 1280×720 frame
 * cropped around him. Both sources are supplied by their own renderers, which
 * copy their drawing buffers at a point where they are known to be intact.
 *
 * `focus` is normalized (0–1) so the caller can name where he stands without
 * knowing how large either canvas happens to be on this device.
 */
export async function composeDayPhoto(
  world: HTMLCanvasElement | null,
  character: HTMLCanvasElement | null,
  focus: { x: number; y: number },
): Promise<Blob | null> {
  const reference = world ?? character;
  if (!reference) return null;
  const crop = photoCropRect(
    reference.width,
    reference.height,
    focus.x * reference.width,
    focus.y * reference.height,
  );
  const target = document.createElement("canvas");
  target.width = DAY_PHOTO_WIDTH;
  target.height = DAY_PHOTO_HEIGHT;
  const context = target.getContext("2d");
  if (!context) return null;

  for (const source of [world, character]) {
    if (!source || source.width === 0 || source.height === 0) continue;
    // Each source may be a different size; map the same normalized window.
    const scaleX = source.width / reference.width;
    const scaleY = source.height / reference.height;
    context.drawImage(
      source,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      DAY_PHOTO_WIDTH,
      DAY_PHOTO_HEIGHT,
    );
  }

  return new Promise((resolve) => {
    target.toBlob((blob) => resolve(blob), "image/webp", 0.8);
  });
}
