import { access } from "node:fs/promises";
import path from "node:path";
import { registeredCountryPacks } from "../src/content/countries/registry";
import { readableCountryPackSchema } from "../src/lib/content/schema";

const packs = registeredCountryPacks();
const versions = new Set<string>();
const assetOwners = new Map<string, string>();

for (const candidate of packs) {
  const pack = readableCountryPackSchema.parse(candidate);
  if (pack.schemaVersion === 1) continue;
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
  if (pack.schemaVersion === 3) {
    const layerKinds = pack.route.zones.map((zone) => new Set(zone.layers.map((layer) => layer.id)));
    if (layerKinds.some((kinds) => !kinds.has("distant") || !kinds.has("architecture") || !kinds.has("ground"))) {
      throw new Error(`${pack.assetVersion} requires distant, architecture, and ground layers in every zone`);
    }
    const fractions = pack.storyBeats.map((beat) => beat.atFraction);
    if (fractions.some((fraction, index) => index > 0 && fraction <= fractions[index - 1])) {
      throw new Error(`${pack.assetVersion} story beats must be strictly ordered`);
    }
    if (pack.culturalReview.status !== "approved") {
      process.stdout.write(`Gate open: ${pack.assetVersion} cultural review is ${pack.culturalReview.status}.\n`);
    }
  }
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

process.stdout.write(`Validated ${packs.length} registered country packs with ${assetOwners.size} uniquely owned scene assets.\n`);
