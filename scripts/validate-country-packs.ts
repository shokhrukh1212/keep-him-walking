import { access } from "node:fs/promises";
import path from "node:path";
import { registeredCountryPacks } from "../src/content/countries/registry";
import { countryPackSchema } from "../src/lib/content/schema";

const packs = registeredCountryPacks();
const versions = new Set<string>();
const assetOwners = new Map<string, string>();

for (const candidate of packs) {
  const pack = countryPackSchema.parse(candidate);
  if (versions.has(pack.assetVersion)) throw new Error(`Duplicate pack version: ${pack.assetVersion}`);
  versions.add(pack.assetVersion);
  const segments = pack.route.zones.flatMap((zone) => zone.layers.flatMap((layer) => layer.segments));
  if (segments.length < 12) throw new Error(`${pack.assetVersion} needs at least 12 route segment families`);

  const urls = new Set([
    pack.scene.fallbackUrl,
    pack.postcardBackgroundUrl,
    ...pack.preload,
    ...pack.audio.map((asset) => asset.url),
    ...Object.values(pack.npcAssets),
    ...Object.values(pack.traveler.fallbackSprites).filter((url): url is string => Boolean(url)),
    ...(pack.traveler.walkCycle?.frames ?? []),
    ...pack.route.zones.flatMap((zone) => [
      zone.fallbackUrl,
      ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : []),
    ]),
  ]);
  for (const url of urls) {
    await access(path.join(process.cwd(), "public", url));
    if (url.includes("/scenes/")) {
      const owner = assetOwners.get(url);
      if (owner && owner !== pack.countryCode) {
        throw new Error(`Scene asset ${url} is reused by ${owner} and ${pack.countryCode}`);
      }
      assetOwners.set(url, pack.countryCode);
    }
  }
}

process.stdout.write(`Validated ${packs.length} registered country pack with ${assetOwners.size} scene assets.\n`);
