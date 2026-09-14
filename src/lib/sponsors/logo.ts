import sharp from "sharp";

export const SPONSOR_LOGO_MAX_BYTES = 1_048_576;
const MIN_EDGE = 64;
const MAX_EDGE = 4_096;
const ACCEPTED = new Set(["png", "jpeg", "webp"]);

export class SponsorLogoError extends Error {
  constructor(readonly code: "LOGO_SIZE" | "LOGO_TYPE" | "LOGO_DIMENSIONS") {
    super(code);
    this.name = "SponsorLogoError";
  }
}

/**
 * The only form a sponsor logo is ever stored or shown in: decoded as PNG, JPEG or
 * WebP by content rather than by name, bounded, then re-encoded as a still WebP of
 * at most 512 px. Re-encoding keeps pixels only, so metadata, scripts, SVG and
 * animation from the upload never reach a page.
 */
export async function prepareSponsorLogo(bytes: Uint8Array): Promise<{ webp: Buffer; width: number; height: number }> {
  if (bytes.byteLength === 0 || bytes.byteLength > SPONSOR_LOGO_MAX_BYTES) throw new SponsorLogoError("LOGO_SIZE");
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes, { limitInputPixels: MAX_EDGE * MAX_EDGE }).metadata();
  } catch {
    throw new SponsorLogoError("LOGO_TYPE");
  }
  if (!metadata.format || !ACCEPTED.has(metadata.format) || (metadata.pages ?? 1) > 1) {
    throw new SponsorLogoError("LOGO_TYPE");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_EDGE || height < MIN_EDGE || width > MAX_EDGE || height > MAX_EDGE) {
    throw new SponsorLogoError("LOGO_DIMENSIONS");
  }
  const webp = await sharp(bytes, { limitInputPixels: MAX_EDGE * MAX_EDGE })
    .rotate()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  const output = await sharp(webp).metadata();
  return { webp, width: output.width ?? 0, height: output.height ?? 0 };
}
