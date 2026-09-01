import { stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { tashkentCountryPackV3 } from "../src/content/countries/tashkent.v3";

let totalTransfer = 0;
let largestDecodedZone = 0;
for (const zone of tashkentCountryPackV3.route.zones) {
  const urls = new Set([
    zone.fallbackUrl,
    ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
    ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : []),
  ]);
  let transfer = 0;
  let decoded = 0;
  for (const url of urls) {
    const file = path.join(process.cwd(), "public", url);
    transfer += (await stat(file)).size;
    const metadata = await sharp(file).metadata();
    decoded += (metadata.width ?? 0) * (metadata.height ?? 0) * 4;
  }
  totalTransfer += transfer;
  largestDecodedZone = Math.max(largestDecodedZone, decoded);
  process.stdout.write(
    `${zone.id}: ${(transfer / 1_048_576).toFixed(2)} MiB transfer, ${(decoded / 1_048_576).toFixed(1)} MiB decoded\n`,
  );
}

if (largestDecodedZone > 96 * 1_048_576) {
  throw new Error("A zone exceeds the 96 MiB low-tier decoded texture budget");
}
process.stdout.write(`Route assets: ${(totalTransfer / 1_048_576).toFixed(2)} MiB transfer total.\n`);
