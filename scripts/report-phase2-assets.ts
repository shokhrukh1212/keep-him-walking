import { stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { registeredCountryPacks } from "../src/content/countries/registry";

const packs = registeredCountryPacks().filter((pack) => pack.schemaVersion === 3);
for (const pack of packs) {
  const packUrls = new Set<string>([
    pack.scene.fallbackUrl,
    pack.postcardBackgroundUrl,
    ...pack.audio.map((asset) => asset.url),
    ...Object.values(pack.npcAssets),
    ...pack.route.zones.flatMap((zone) => [
      zone.fallbackUrl,
      ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : []),
    ]),
  ]);
  let packTransfer = 0;
  for (const url of packUrls) packTransfer += (await stat(path.join(process.cwd(), "public", url))).size;
  if (packTransfer > pack.assetBudgetBytes) {
    throw new Error(`${pack.packId} is ${(packTransfer / 1_048_576).toFixed(2)} MiB, above its ${(pack.assetBudgetBytes / 1_048_576).toFixed(2)} MiB budget`);
  }
  let largestDecodedZone = 0;
  for (const zone of pack.route.zones) {
    const urls = new Set([
      zone.fallbackUrl,
      ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : []),
    ]);
    let decoded = 0;
    for (const url of urls) {
      if (!/\.(webp|png|jpe?g)$/i.test(url)) continue;
      const metadata = await sharp(path.join(process.cwd(), "public", url)).metadata();
      decoded += (metadata.width ?? 0) * (metadata.height ?? 0) * 4;
    }
    largestDecodedZone = Math.max(largestDecodedZone, decoded);
  }
  if (largestDecodedZone > 96 * 1_048_576) throw new Error(`${pack.packId} exceeds the 96 MiB low-tier decoded texture cap`);
  process.stdout.write(`${pack.packId}: ${(packTransfer / 1_048_576).toFixed(2)} MiB transfer, ${(largestDecodedZone / 1_048_576).toFixed(1)} MiB largest decoded zone\n`);
}
