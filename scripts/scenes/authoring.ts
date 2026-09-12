import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  ZONE_KINDS,
  conversationScriptSchema,
  placeTagSchema,
  stageSchema,
  type ConversationScript,
  type SceneVariant,
  type ZoneVariants,
} from "../../src/lib/content/schema";
import {
  blendTileEdges,
  dominantPalette,
  exportName,
  packAuthoringSchema,
  parseSlug,
  updateAuthoredRegistry,
  writeAtomic,
  type PackAuthoring,
} from "../packs/authoring";
import { lintAuthoredContent } from "../packs/safety";

/**
 * Builds an immutable, variable-length scene manifest from the owner's paintings.
 *
 * Every rendition is content-addressed (`city-full-2560.<hash>.webp`), so a URL
 * never changes meaning and can be cached for a year on the application origin or
 * a CDN. A new place or a repainted place means a new pack version; a journey day
 * keeps the version it started with.
 */

const WEATHER = ["clear", "breeze", "haze", "golden", "evening"] as const;
const artPath = z.string()
  .regex(/^(?!\/)[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)$/)
  .refine((value) => !value.split("/").includes(".."), "Artwork paths stay inside the city's art folder");

export const placesAuthoringSchema = z.object({
  packVersion: z.number().int().min(2),
  sceneVisitSeconds: z.number().int().min(60).max(3_600).default(420),
  targetPlaceCount: z.number().int().min(1).max(24).default(10),
  places: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60),
    label: z.string().min(1).max(80),
    tags: z.array(placeTagSchema).min(1).max(12),
    description: z.string().min(1).max(160),
    day: artPath,
    night: artPath.optional(),
    weather: z.enum(WEATHER).optional(),
    stage: stageSchema.partial().optional(),
  }).strict()).min(1).max(24),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const place of value.places) {
    if (ids.has(place.id)) context.addIssue({ code: "custom", path: ["places"], message: `Duplicate place ${place.id}` });
    ids.add(place.id);
  }
});

export const conversationsAuthoringSchema = z.object({
  conversations: z.array(conversationScriptSchema).max(40),
}).strict();

export type PlacesAuthoring = z.infer<typeof placesAuthoringSchema>;

export type SceneBuildOptions = {
  nominalWidth: number;
  nominalHeight: number;
  cityWidths: number[];
  centerWidths: number[];
  skyWidths: number[];
  groundWidths: number[];
  skyTopRows: number;
  groundRows: number;
};

export const DEFAULT_SCENE_BUILD: SceneBuildOptions = {
  nominalWidth: 3_600,
  nominalHeight: 1_200,
  cityWidths: [1_920, 2_560, 3_600],
  centerWidths: [800, 1_200],
  skyWidths: [800, 1_600],
  groundWidths: [1_800, 3_600],
  skyTopRows: 660,
  groundRows: 216,
};

export type ScenePlaceReport = {
  sourceHash: string;
  palette: [string, string, string];
  night: boolean;
  /** What a full-quality desktop downloads for this place. */
  desktopBytes: number;
  /** What a portrait phone downloads for this place. */
  mobileBytes: number;
  storedBytes: number;
};

export type SceneBuildReport = {
  schemaVersion: 1;
  packId: string;
  builtAt: string;
  placeCount: number;
  targetPlaceCount: number;
  warnings: string[];
  assetBudgetBytes: number;
  /** The largest current-plus-next pair a desktop viewer can hold. */
  largestTwoPlaceDesktopBytes: number;
  largestTwoPlaceMobileBytes: number;
  places: Record<string, ScenePlaceReport>;
};

const RENDITION_NAME = /^(?:city|night|sky|ground)-(?:full|center)-\d+\.[0-9a-f]{10}\.webp$/;

export function variantFileName(
  layer: "city" | "night" | "sky" | "ground",
  crop: SceneVariant["crop"],
  width: number,
  bytes: Uint8Array,
): string {
  return `${layer}-${crop}-${width}.${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.webp`;
}

type Raw = { data: Buffer; info: { width: number; height: number; channels: 1 | 2 | 3 | 4 } };
type Rendition = { name: string; buffer: Buffer; variant: SceneVariant };

async function normalizedRaw(source: string, options: SceneBuildOptions): Promise<Raw> {
  return sharp(source)
    .rotate()
    .resize(options.nominalWidth, options.nominalHeight, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function rendition(
  urlRoot: string,
  layer: "city" | "night" | "sky" | "ground",
  crop: SceneVariant["crop"],
  width: number,
  height: number,
  buffer: Buffer,
): Rendition {
  const name = variantFileName(layer, crop, width, buffer);
  return { name, buffer, variant: { url: `${urlRoot}/${name}`, width, height, bytes: buffer.byteLength, crop } };
}

async function paintingRenditions(
  raw: Raw, layer: "city" | "night", urlRoot: string, options: SceneBuildOptions,
): Promise<Rendition[]> {
  const results: Rendition[] = [];
  for (const width of options.cityWidths) {
    const height = Math.round(width * options.nominalHeight / options.nominalWidth);
    const buffer = await sharp(raw.data, { raw: raw.info })
      .resize(width, height, { fit: "fill" })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
    results.push(rendition(urlRoot, layer, "full", width, height, buffer));
  }
  // The middle of the painting at full height: all a portrait screen ever shows.
  const square = Math.min(options.nominalHeight, options.nominalWidth);
  const left = Math.round((options.nominalWidth - square) / 2);
  for (const width of options.centerWidths) {
    const buffer = await sharp(raw.data, { raw: raw.info })
      .extract({ left, top: 0, width: square, height: options.nominalHeight })
      .resize(width, width, { fit: "fill" })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
    results.push(rendition(urlRoot, layer, "center", width, width, buffer));
  }
  return results;
}

async function skyRenditions(raw: Raw, urlRoot: string, options: SceneBuildOptions): Promise<Rendition[]> {
  const results: Rendition[] = [];
  for (const width of options.skyWidths) {
    const height = Math.round(width * 9 / 16);
    const buffer = await sharp(raw.data, { raw: raw.info })
      .extract({ left: 0, top: 0, width: options.nominalWidth, height: options.skyTopRows })
      .resize(width, height, { fit: "fill" })
      .blur(Math.max(0.3, 1.2 * width / 1_600))
      .webp({ quality: 76, effort: 5 })
      .toBuffer();
    results.push(rendition(urlRoot, "sky", "full", width, height, buffer));
  }
  return results;
}

async function groundRenditions(raw: Raw, urlRoot: string, options: SceneBuildOptions): Promise<Rendition[]> {
  const strip = await sharp(raw.data, { raw: raw.info })
    .extract({
      left: 0,
      top: options.nominalHeight - options.groundRows,
      width: options.nominalWidth,
      height: options.groundRows,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blended = blendTileEdges(strip.data, strip.info.width, strip.info.height, strip.info.channels);
  const results: Rendition[] = [];
  for (const width of options.groundWidths) {
    const height = Math.max(1, Math.round(options.groundRows * width / options.nominalWidth));
    const buffer = await sharp(blended, { raw: strip.info })
      .resize(width, height, { fit: "fill" })
      .webp({ quality: 80, effort: 5 })
      .toBuffer();
    results.push(rendition(urlRoot, "ground", "full", width, height, buffer));
  }
  return results;
}

function largestBytes(variants: readonly SceneVariant[], crop: SceneVariant["crop"]): number {
  return [...variants].filter((variant) => variant.crop === crop)
    .sort((left, right) => right.width - left.width)[0]?.bytes ?? 0;
}

function smallestBytes(variants: readonly SceneVariant[]): number {
  return [...variants].sort((left, right) => left.width - right.width)[0]?.bytes ?? 0;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export function renderScenePackModule(
  slug: string,
  pack: PackAuthoring,
  places: PlacesAuthoring,
  conversations: ConversationScript[],
  variants: Record<string, ZoneVariants>,
  palettes: Record<string, [string, string, string]>,
  assetBudgetBytes: number,
): string {
  const story = conversations.find((script) => script.role === "story");
  const storyPlace = places.places.find((place) => story?.placeTags.some((tag) => place.tags.includes(tag)))
    ?? places.places.find((place) => place.tags.includes("lanes"))
    ?? places.places[0]!;
  const value = {
    packId: `${slug}-v${places.packVersion}`,
    countryCode: pack.iso2,
    countryName: pack.country,
    cityName: pack.city,
    timeZone: pack.timezone,
    lat: pack.lat,
    lon: pack.lon,
    neighbours: pack.neighbours,
    voteBlurb: pack.voteBlurb,
    zones: places.places.map((place, index) => ({
      id: place.id,
      label: place.label,
      weather: place.weather ?? WEATHER[index % WEATHER.length],
      palette: palettes[place.id],
      kind: place.tags.find((tag) => (ZONE_KINDS as readonly string[]).includes(tag)),
      tags: place.tags,
      description: place.description,
      stage: { ...(place.stage ?? {}), palette: palettes[place.id] },
    })),
    sceneVisitSeconds: places.sceneVisitSeconds,
    encounter: {
      npcId: `${slug}-resident`,
      locationLabel: storyPlace.label,
      phrase: pack.localPhrase,
      exchange: pack.dialogue.map((line) => line.text),
      dialogue: pack.dialogue,
    },
    conversations,
    resident: pack.resident,
    notebookLines: pack.notebookLines,
    postcardTitle: pack.postcard.title,
    postcardCopy: pack.postcard.copy,
    sourceNotes: [
      `Scene manifest v${places.packVersion} for ${pack.city}: ${places.places.length} places; cultural-safety review is still required.`,
      `AI-assisted source paintings are preserved under art/${slug}; the build derives content-addressed renditions and makes no cultural claims.`,
    ],
    culturalReview: {
      reviewerName: null,
      reviewedAt: null,
      status: "pending",
      qualification: null,
      disposition: null,
      publicLaunchRequirement: null,
      citations: [],
      notes: "Generated scene manifest awaiting the owner's documented cultural-safety review.",
    },
    assetBudgetBytes,
    authoredAssets: { variants },
  };
  return `/* Generated by pnpm scenes:build. Edit art/${slug}/places.json, conversations.json or pack.json, then rebuild. */\n`
    + `import { createPhase2CountryPack } from "./phase2-factory";\n\n`
    + `export const ${exportName(slug, places.packVersion)} = createPhase2CountryPack(${JSON.stringify(value, null, 2)});\n`;
}

export async function buildScenePack(
  root: string,
  rawSlug: string,
  options: SceneBuildOptions = DEFAULT_SCENE_BUILD,
  now = new Date(),
): Promise<SceneBuildReport> {
  const slug = parseSlug(rawSlug);
  const artRoot = path.join(root, "art", slug);
  const pack = packAuthoringSchema.parse(JSON.parse(await readFile(path.join(artRoot, "pack.json"), "utf8")));
  const places = placesAuthoringSchema.parse(JSON.parse(await readFile(path.join(artRoot, "places.json"), "utf8")));
  const conversationsFile = path.join(artRoot, "conversations.json");
  const conversations = await exists(conversationsFile)
    ? conversationsAuthoringSchema.parse(JSON.parse(await readFile(conversationsFile, "utf8"))).conversations
    : [];

  const findings = await lintAuthoredContent(root, {
    pack,
    places: places.places.map(({ label, description, tags }) => ({ label, description, tags })),
    conversations,
  });
  if (findings.length > 0) {
    throw new Error(`Banned-topic review required:\n${findings.map((item) => `- ${item.path}: ${item.term}`).join("\n")}`);
  }
  const missing: string[] = [];
  for (const place of places.places) {
    for (const source of [place.day, ...(place.night ? [place.night] : [])]) {
      if (!await exists(path.join(artRoot, source))) missing.push(path.join("art", slug, source));
    }
  }
  if (missing.length > 0) throw new Error(`Missing required artwork:\n${missing.map((item) => `- ${item}`).join("\n")}`);

  // Refuse duplicated paintings before writing anything.
  const raws = new Map<string, Raw>();
  const owners = new Map<string, string>();
  const sourceHashes: Record<string, string> = {};
  for (const place of places.places) {
    const raw = await normalizedRaw(path.join(artRoot, place.day), options);
    const hash = createHash("sha256").update(raw.data).digest("hex").slice(0, 16);
    const owner = owners.get(hash);
    if (owner) throw new Error(`${place.id} uses the same painting as ${owner}; every place needs its own artwork`);
    owners.set(hash, place.id);
    raws.set(place.id, raw);
    sourceHashes[place.id] = hash;
  }

  const version = places.packVersion;
  const variants: Record<string, ZoneVariants> = {};
  const palettes: Record<string, [string, string, string]> = {};
  const report: SceneBuildReport = {
    schemaVersion: 1,
    packId: `${slug}-v${version}`,
    builtAt: now.toISOString(),
    placeCount: places.places.length,
    targetPlaceCount: places.targetPlaceCount,
    warnings: places.places.length < places.targetPlaceCount
      ? [`${places.places.length} of ${places.targetPlaceCount} target places; add approved paintings and rebuild as a new version`]
      : [],
    assetBudgetBytes: 5_767_168,
    largestTwoPlaceDesktopBytes: 0,
    largestTwoPlaceMobileBytes: 0,
    places: {},
  };

  for (const place of places.places) {
    const raw = raws.get(place.id)!;
    const urlRoot = `/scenes/${slug}/v${version}/places/${place.id}`;
    const directory = path.join(root, "public", urlRoot);
    const city = await paintingRenditions(raw, "city", urlRoot, options);
    const sky = await skyRenditions(raw, urlRoot, options);
    const ground = await groundRenditions(raw, urlRoot, options);
    const night = place.night
      ? await paintingRenditions(await normalizedRaw(path.join(artRoot, place.night), options), "night", urlRoot, options)
      : [];
    const all = [...city, ...sky, ...ground, ...night];
    const keep = new Set(all.map((item) => item.name));
    if (await exists(directory)) {
      for (const name of await readdir(directory)) {
        if (RENDITION_NAME.test(name) && !keep.has(name)) await rm(path.join(directory, name));
      }
    }
    for (const item of all) await writeAtomic(path.join(directory, item.name), item.buffer);

    variants[place.id] = {
      nominalWidth: options.nominalWidth,
      nominalHeight: options.nominalHeight,
      city: city.map((item) => item.variant),
      sky: sky.map((item) => item.variant),
      ground: ground.map((item) => item.variant),
      night: night.map((item) => item.variant),
    };
    palettes[place.id] = dominantPalette(raw.data, raw.info.channels);
    const placeVariants = variants[place.id]!;
    report.places[place.id] = {
      sourceHash: sourceHashes[place.id]!,
      palette: palettes[place.id]!,
      night: night.length > 0,
      desktopBytes: largestBytes(placeVariants.city, "full") + largestBytes(placeVariants.sky, "full")
        + largestBytes(placeVariants.ground, "full") + largestBytes(placeVariants.night, "full"),
      mobileBytes: largestBytes(placeVariants.city, "center") + smallestBytes(placeVariants.sky)
        + smallestBytes(placeVariants.ground) + largestBytes(placeVariants.night, "center"),
      storedBytes: all.reduce((total, item) => total + item.buffer.byteLength, 0),
    };
  }

  const ordered = places.places.map((place) => report.places[place.id]!);
  const pairs = ordered.map((place, index) => [place, ordered[(index + 1) % ordered.length]!] as const);
  report.largestTwoPlaceDesktopBytes = Math.max(...pairs.map(([current, next]) => current.desktopBytes + (next === current ? 0 : next.desktopBytes)));
  report.largestTwoPlaceMobileBytes = Math.max(...pairs.map(([current, next]) => current.mobileBytes + (next === current ? 0 : next.mobileBytes)));
  if (report.largestTwoPlaceDesktopBytes > report.assetBudgetBytes) {
    throw new Error(`Two neighbouring places need ${(report.largestTwoPlaceDesktopBytes / 1_048_576).toFixed(2)} MiB; budget is ${(report.assetBudgetBytes / 1_048_576).toFixed(2)} MiB`);
  }

  const postcardPlace = places.places.find((place) => place.tags.includes("landmark")) ?? places.places.at(-1)!;
  const postcardRaw = raws.get(postcardPlace.id)!;
  const postcard = await sharp(postcardRaw.data, { raw: postcardRaw.info })
    .resize(1_200, 630, { fit: "cover" })
    .webp({ quality: 84, effort: 5 })
    .toBuffer();
  await writeAtomic(path.join(root, "public", "postcards", slug, `v${version}`, "background.webp"), postcard);

  await writeAtomic(path.join(artRoot, `scenes-v${version}.build.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomic(
    path.join(root, "src", "content", "countries", `${slug}.v${version}.ts`),
    renderScenePackModule(slug, pack, places, conversations, variants, palettes, report.assetBudgetBytes),
  );
  await updateAuthoredRegistry(root, slug, version);
  return report;
}
