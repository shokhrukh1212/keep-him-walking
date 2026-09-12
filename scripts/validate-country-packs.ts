import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { registeredCountryPacks } from "../src/content/countries/registry";
import { readableCountryPackSchema, type SceneVariant } from "../src/lib/content/schema";
import { horizontalEdgeMismatch } from "../src/lib/content/seam-audit";

const packs = registeredCountryPacks();
const versions = new Set<string>();
const assetOwners = new Map<string, string>();
const auditedSeams = new Set<string>();
const MAX_GROUND_EDGE_MISMATCH = 0.08;
/** The owner's target for a city manifest; fewer places is allowed but reported. */
const TARGET_PLACE_COUNT = 10;

function largest(variants: readonly SceneVariant[], crop: SceneVariant["crop"] = "full"): SceneVariant | null {
  return [...variants].filter((variant) => variant.crop === crop).sort((left, right) => right.width - left.width)[0] ?? null;
}

for (const candidate of packs) {
  const pack = readableCountryPackSchema.parse(candidate);
  if (pack.schemaVersion === 1) continue;
  if (versions.has(pack.assetVersion)) throw new Error(`Duplicate pack version: ${pack.assetVersion}`);
  versions.add(pack.assetVersion);
  // Every place has its own painting rather than borrowing a neighbour's.
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
      ...(zone.nightUrl ? [zone.nightUrl] : []),
      ...(zone.lightsUrl ? [zone.lightsUrl] : []),
      ...(zone.continuousScene
        ? Object.values(zone.continuousScene).filter((value): value is string => typeof value === "string")
        : []),
      ...(zone.variants
        ? [...zone.variants.city, ...zone.variants.sky, ...zone.variants.ground, ...zone.variants.night].map((variant) => variant.url)
        : []),
      ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : []),
    ]),
  ]);
  if (pack.schemaVersion === 3) {
    // The distant/architecture crops were retired with the parallax renderer in
    // P18. What the renderer needs now is a ground plane in every zone.
    const layerKinds = pack.route.zones.map((zone) => new Set(zone.layers.map((layer) => layer.id)));
    if (pack.route.zones.some((zone, index) => !zone.continuousScene && !layerKinds[index]!.has("ground"))) {
      throw new Error(`${pack.assetVersion} requires a ground layer in every zone`);
    }
    if (!['approved', 'creator_reviewed', 'provisional_preview'].includes(pack.culturalReview.status)) {
      process.stdout.write(`Authoring only: ${pack.assetVersion} is registered for preview but cannot enter a vote.\n`);
    }
    if (pack.culturalReview.status === "provisional_preview") {
      process.stdout.write(`Private-preview only: ${pack.assetVersion} requires qualified local review before public launch.\n`);
    }
    const tags = new Set(pack.route.zones.flatMap((zone) => zone.tags));
    for (const beat of pack.storyBeats) {
      const tag = beat.placeTag ?? { arrival: "arrival", encounter: "lanes", food: "cafe", landmark: "landmark", departure: null }[beat.kind];
      if (tag && !tags.has(tag)) {
        process.stdout.write(`Story skipped: ${pack.assetVersion} has no "${tag}" place for its ${beat.kind} beat.\n`);
      }
    }
  }
  for (const url of urls) {
    const assetPath = path.join(process.cwd(), "public", url);
    await access(assetPath);
    if (url.includes("/scenes/")) {
      const owner = assetOwners.get(url);
      if (owner && owner !== pack.countryCode) {
        throw new Error(`Scene asset ${url} is reused by ${owner} and ${pack.countryCode}`);
      }
      assetOwners.set(url, pack.countryCode);
    }
  }
  if (pack.schemaVersion === 3) {
    const manifestZones = pack.route.zones.filter((zone) => zone.variants);
    if (manifestZones.length > 0) {
      if (pack.route.zones.length < TARGET_PLACE_COUNT) {
        process.stdout.write(`${pack.assetVersion}: ${pack.route.zones.length} of ${TARGET_PLACE_COUNT} target places.\n`);
      }
      // A manifest must describe its files truthfully and never fake a place.
      const paintingHashes = new Map<string, string>();
      const desktopBytes: number[] = [];
      for (const zone of manifestZones) {
        const variants = zone.variants!;
        for (const variant of [...variants.city, ...variants.sky, ...variants.ground, ...variants.night]) {
          const actual = (await stat(path.join(process.cwd(), "public", variant.url))).size;
          if (actual !== variant.bytes) {
            throw new Error(`${pack.assetVersion} ${variant.url} is ${actual} bytes but the manifest says ${variant.bytes}`);
          }
        }
        const painting = largest(variants.city);
        if (!painting) throw new Error(`${pack.assetVersion}/${zone.id} has no full painting`);
        const hash = createHash("sha256").update(await readFile(path.join(process.cwd(), "public", painting.url))).digest("hex");
        const owner = paintingHashes.get(hash);
        if (owner) throw new Error(`${pack.assetVersion}: ${zone.id} repeats the painting of ${owner}`);
        paintingHashes.set(hash, zone.id);
        desktopBytes.push([largest(variants.city), largest(variants.sky), largest(variants.ground), largest(variants.night)]
          .reduce((total, variant) => total + (variant?.bytes ?? 0), 0));
      }
      const window = Math.max(...desktopBytes.map((bytes, index) =>
        bytes + (desktopBytes.length > 1 ? desktopBytes[(index + 1) % desktopBytes.length]! : 0)));
      if (window > pack.assetBudgetBytes) {
        throw new Error(`${pack.assetVersion}: a viewer holding two neighbouring places downloads ${window} bytes; budget is ${pack.assetBudgetBytes}`);
      }
    }
    for (const zone of pack.route.zones) {
      const groundUrls = [
        ...(zone.continuousScene ? [zone.continuousScene.groundUrl] : []),
        ...(zone.variants?.ground.map((variant) => variant.url) ?? []),
      ];
      for (const url of groundUrls) {
        if (auditedSeams.has(url)) continue;
        auditedSeams.add(url);
        const { data, info } = await sharp(path.join(process.cwd(), "public", url))
          .rotate()
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const mismatch = horizontalEdgeMismatch(
          data,
          info.width,
          info.height,
          info.channels,
        );
        if (mismatch > MAX_GROUND_EDGE_MISMATCH) {
          throw new Error(
            `${pack.assetVersion} ground ${url} is not horizontally seamless `
            + `(edge mismatch ${(mismatch * 100).toFixed(1)}%, max ${MAX_GROUND_EDGE_MISMATCH * 100}%)`,
          );
        }
      }
    }
  }
}

process.stdout.write(`Validated ${packs.length} registered country packs with ${assetOwners.size} uniquely owned scene assets.\n`);
