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
  // Phase 2 stacked several parallax crops per zone and this asked for twelve
  // families across the route. Schema-v3 zones are one coherent painting each,
  // so the guarantee that still means something is that every zone has its own
  // painting rather than borrowing a neighbour's.
  const paintings = new Set(pack.route.zones.map((zone) => zone.fallbackUrl));
  if (paintings.size !== pack.route.zones.length) {
    throw new Error(`${pack.assetVersion} reuses a zone painting; each zone needs its own`);
  }

  const urls = new Set([
    pack.scene.fallbackUrl,
    pack.postcardBackgroundUrl,
    ...pack.preload,
    ...pack.audio.map((asset) => asset.url),
    ...Object.values(pack.npcAssets),
    ...Object.values(pack.traveler.fallbackSprites).filter((url): url is string => Boolean(url)),
    ...(pack.schemaVersion === 3 ? Object.values(pack.npcSystem.states) : []),
    ...pack.route.zones.flatMap((zone) => [
      zone.fallbackUrl,
      ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : []),
    ]),
  ]);
  if (pack.schemaVersion === 3) {
    // The distant/architecture crops were retired with the parallax renderer in
    // P18. What the renderer needs now is a ground plane in every zone.
    const layerKinds = pack.route.zones.map((zone) => new Set(zone.layers.map((layer) => layer.id)));
    if (layerKinds.some((kinds) => !kinds.has("ground"))) {
      throw new Error(`${pack.assetVersion} requires a ground layer in every zone`);
    }
    const metres = pack.storyBeats
      .filter((beat) => beat.kind !== "departure")
      .map((beat) => beat.atMetres ?? 0);
    if (metres.some((atMetres, index) => index > 0 && atMetres <= metres[index - 1])) {
      throw new Error(`${pack.assetVersion} route story beats must be strictly ordered by metres`);
    }
    if (!['approved', 'creator_reviewed', 'provisional_preview'].includes(pack.culturalReview.status)) {
      throw new Error(`${pack.assetVersion} is not eligible for private preview`);
    }
    if (pack.culturalReview.status === "provisional_preview") {
      process.stdout.write(`Private-preview only: ${pack.assetVersion} requires qualified local review before public launch.\n`);
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
