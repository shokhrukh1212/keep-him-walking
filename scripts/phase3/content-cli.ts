import { stat } from "node:fs/promises";
import path from "node:path";
import { registeredCountryPacks } from "../../src/content/countries/registry";
import { readableCountryPackSchema } from "../../src/lib/content/schema";

const json = process.argv.includes("--json");
const summaries = [];
for (const candidate of registeredCountryPacks()) {
  const pack = readableCountryPackSchema.parse(candidate);
  if (pack.schemaVersion !== 3) continue;
  const urls = new Set([
    pack.scene.fallbackUrl, pack.postcardBackgroundUrl,
    ...pack.audio.map((item) => item.url), ...Object.values(pack.npcAssets),
    ...pack.route.zones.flatMap((zone) => [zone.fallbackUrl, ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)), ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : [])]),
  ]);
  let transferBytes = 0;
  for (const url of urls) transferBytes += (await stat(path.join(process.cwd(), "public", url))).size;
  summaries.push({ packId: pack.packId, countryCode: pack.countryCode, zones: pack.route.zones.length, storyBeats: pack.storyBeats.length, culturalReview: pack.culturalReview.status, assetCount: urls.size, transferBytes, budgetBytes: pack.assetBudgetBytes, withinBudget: transferBytes <= pack.assetBudgetBytes });
}
if (summaries.some((pack) => !pack.withinBudget)) throw new Error("One or more country packs exceed their transfer budget");
if (json) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), packs: summaries }, null, 2)}\n`);
else for (const pack of summaries) process.stdout.write(`${pack.packId}: ${pack.zones} zones, ${pack.assetCount} assets, ${(pack.transferBytes / 1_048_576).toFixed(2)} MiB / ${(pack.budgetBytes / 1_048_576).toFixed(2)} MiB\n`);
