import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { CountryPack } from "@/lib/content/schema";

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;",
  })[character] ?? character);
}

function publicAssetPath(url: string): string {
  const publicRoot = path.resolve(process.cwd(), "public");
  const resolved = path.resolve(publicRoot, url.replace(/^\//, ""));
  if (!resolved.startsWith(`${publicRoot}${path.sep}`)) throw new Error("INVALID_POSTCARD_ASSET");
  return resolved;
}

function overlaySvg(width: number, height: number, input: {
  city: string;
  country: string;
  dayNumber: number;
  contributionSeconds: number;
  copy: string;
  color: string;
}) {
  const minutes = Math.max(1, Math.floor(input.contributionSeconds / 60));
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#07151e" stop-opacity=".78"/><stop offset=".68" stop-color="#07151e" stop-opacity=".08"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#shade)"/>
    <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.13)}" fill="${input.color}" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.024)}" font-weight="700" letter-spacing="4">DAY ${input.dayNumber} · KEEP HIM WALKING</text>
    <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.49)}" fill="${input.color}" font-family="Georgia, serif" font-size="${Math.round(width * 0.075)}">${escapeXml(input.city)}</text>
    <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.58)}" fill="${input.color}" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.026)}">${escapeXml(input.country)} · ${minutes} minute${minutes === 1 ? "" : "s"} contributed</text>
    <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.74)}" fill="${input.color}" font-family="Georgia, serif" font-size="${Math.round(width * 0.03)}">${escapeXml(input.copy)}</text>
  </svg>`);
}

export async function renderPostcard(pack: CountryPack, input: {
  dayNumber: number;
  contributionSeconds: number;
}): Promise<{ image: Buffer; openGraph: Buffer }> {
  const source = await readFile(publicAssetPath(pack.postcardBackgroundUrl));
  const v3 = pack.schemaVersion === 3 ? pack.postcard : {
    safeCopy: `We kept the traveler moving through ${pack.cityName}.`,
    textColor: "#fff8e8",
  };
  const common = {
    city: pack.cityName,
    country: pack.countryName,
    dayNumber: input.dayNumber,
    contributionSeconds: input.contributionSeconds,
    copy: v3.safeCopy,
    color: v3.textColor,
  };
  const [image, openGraph] = await Promise.all([
    sharp(source).resize(1600, 1000, { fit: "cover" }).composite([{ input: overlaySvg(1600, 1000, common) }]).webp({ quality: 88 }).toBuffer(),
    sharp(source).resize(1200, 630, { fit: "cover" }).composite([{ input: overlaySvg(1200, 630, common) }]).webp({ quality: 86 }).toBuffer(),
  ]);
  return { image, openGraph };
}
