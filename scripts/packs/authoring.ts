import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { lintAuthoredContent } from "./safety";

export const PACK_ZONE_KINDS = ["arrival", "lanes", "market", "cafe", "landmark"] as const;
const moodSchema = z.enum(["neutral", "curious", "surprised", "amused", "thoughtful"]);

export const packAuthoringSchema = z.object({
  version: z.number().int().positive().default(1),
  country: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  iso2: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().min(3).max(80),
  neighbours: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/)),
  zones: z.object({
    arrival: z.string().min(4).max(240),
    lanes: z.string().min(4).max(240),
    market: z.string().min(4).max(240),
    cafe: z.string().min(4).max(240),
    landmark: z.string().min(4).max(240),
  }).strict(),
  landmark: z.string().min(2).max(120),
  localPhrase: z.object({
    original: z.string().min(1).max(120),
    transliteration: z.string().min(1).max(160),
    gloss: z.string().min(1).max(160),
    pronunciation: z.string().min(1).max(160),
  }).strict(),
  resident: z.object({
    name: z.string().min(1).max(80),
    role: z.string().min(1).max(120),
    variantId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }).strict(),
  dialogue: z.array(z.object({
    speaker: z.enum(["traveler", "npc"]),
    text: z.string().min(1).max(240),
    mood: moodSchema,
  }).strict()).length(6),
  notebookLines: z.array(z.string().min(1).max(240)).length(8),
  voteBlurb: z.string().min(1).max(140),
  postcard: z.object({
    title: z.string().min(1).max(80),
    copy: z.string().min(1).max(240),
  }).strict(),
}).strict();

export type PackAuthoring = z.infer<typeof packAuthoringSchema>;

export type PackBuild = {
  schemaVersion: 1;
  builtAt: string;
  assetBudgetBytes: number;
  transferBytes: number;
  zones: Record<string, {
    palette: [string, string, string];
    night: boolean;
    lights: boolean;
    continuous: boolean;
    bytes: number;
  }>;
};

export function parseSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Pack slug must contain lowercase letters, numbers and single hyphens only");
  }
  return slug;
}

export function zoneId(slug: string, kind: typeof PACK_ZONE_KINDS[number]): string {
  return `${slug}-${kind}`;
}

export function exportName(slug: string, version: number): string {
  return `${slug.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())}CountryPackV${version}`;
}

export function renderPackModule(slug: string, input: PackAuthoring, build?: PackBuild): string {
  const palettes = Object.fromEntries(PACK_ZONE_KINDS.map((kind) => {
    const id = zoneId(slug, kind);
    return [id, build?.zones[id]?.palette ?? ["#b9a27a", "#6f7a5a", "#2e3a4f"]];
  }));
  const nightZoneIds = PACK_ZONE_KINDS.map((kind) => zoneId(slug, kind)).filter((id) => build?.zones[id]?.night);
  const lightsZoneIds = PACK_ZONE_KINDS.map((kind) => zoneId(slug, kind)).filter((id) => build?.zones[id]?.lights);
  const continuousSceneZoneIds = PACK_ZONE_KINDS.map((kind) => zoneId(slug, kind)).filter((id) => build?.zones[id]?.continuous);
  const labels: Record<typeof PACK_ZONE_KINDS[number], string> = {
    arrival: `${input.city} arrival`,
    lanes: `${input.city} neighbourhood lanes`,
    market: `${input.city} market`,
    cafe: `${input.city} cafe`,
    landmark: input.landmark,
  };
  const weather = ["clear", "breeze", "haze", "golden", "evening"] as const;
  const zones = PACK_ZONE_KINDS.map((kind, index) => ({
    id: zoneId(slug, kind),
    label: labels[kind],
    weather: weather[index],
    palette: palettes[zoneId(slug, kind)],
    stage: { palette: palettes[zoneId(slug, kind)] },
  }));
  const value = {
    packId: `${slug}-v${input.version}`,
    countryCode: input.iso2,
    countryName: input.country,
    cityName: input.city,
    timeZone: input.timezone,
    lat: input.lat,
    lon: input.lon,
    neighbours: input.neighbours,
    voteBlurb: input.voteBlurb,
    zones,
    encounter: {
      npcId: `${slug}-resident`,
      locationLabel: labels.lanes,
      phrase: input.localPhrase,
      exchange: input.dialogue.map((line) => line.text),
      dialogue: input.dialogue,
    },
    resident: input.resident,
    notebookLines: input.notebookLines,
    postcardTitle: input.postcard.title,
    postcardCopy: input.postcard.copy,
    sourceNotes: [
      `P19 authoring record for ${input.city}; cultural-safety review is still required.`,
      `AI-assisted source paintings are preserved under art/${slug}; the build pipeline only derives runtime assets and makes no cultural claims.`,
    ],
    culturalReview: {
      reviewerName: null,
      reviewedAt: null,
      status: "pending",
      qualification: null,
      disposition: null,
      publicLaunchRequirement: null,
      citations: [],
      notes: "Generated pack awaiting the owner's documented cultural-safety review.",
    },
    assetBudgetBytes: build?.assetBudgetBytes ?? 5_767_168,
    authoredAssets: { nightZoneIds, lightsZoneIds, continuousSceneZoneIds },
  };
  return `/* Generated by pnpm pack:new / pack:build. Edit art/${slug}/pack.json, then rebuild. */\n`
    + `import { createPhase2CountryPack } from "./phase2-factory";\n\n`
    + `export const ${exportName(slug, input.version)} = createPhase2CountryPack(${JSON.stringify(value, null, 2)});\n`;
}

export function renderPromptReadme(slug: string, input: PackAuthoring): string {
  const base = (description: string) => `A wide painterly street panorama of ${description} in ${input.city}, ${input.country}, seen at eye level looking along the pavement, warm afternoon light, locally accurate architecture, materials and colours, empty pavement in the foreground running left to right at the lower fifth of the frame, no people, no readable text or signs, no flags, no vehicles in the foreground, gentle atmospheric depth, clean edges, storybook realism, consistent with a travel illustration series. Aspect 3:1.`;
  const lines = [
    `# ${input.city} artwork`,
    "",
    "Keep every source painting. The build command never generates or replaces artwork.",
    "",
  ];
  for (const kind of PACK_ZONE_KINDS) {
    const id = zoneId(slug, kind);
    lines.push(`## ${kind}`, "", base(input.zones[kind]), "", "Save as `art/" + slug + "/zones/" + id + "/master.png`.", "");
  }
  const landmarkId = zoneId(slug, "landmark");
  lines.push(
    "## Landmark night",
    "",
    `Use the ${input.landmark} master as img2img: same scene at night, warm lit windows, a few street lamps, deep blue sky, no people. Keep denoise between 0.35 and 0.45.`,
    "",
    "Save as `art/" + slug + "/zones/" + landmarkId + "/night.png`.",
    "",
    "## Foreground cutouts",
    "",
    `Create two or three locally ordinary foreground objects for ${input.city}, such as a lamp post, tree, kiosk or fountain edge, isolated on flat magenta, with no people, flags or readable text. Cutouts remain optional because the runtime has procedural foreground details.`,
    "",
    "## Build",
    "",
    "Run `pnpm pack:build " + slug + "`. It requires all five masters and the landmark night image. The build derives a bounded city painting, soft sky plate and edge-audited moving pavement from each master. Optional `lights.png` files beside any master become dusk overlays.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export async function scaffoldPack(root: string, rawSlug: string, candidate: unknown): Promise<void> {
  const slug = parseSlug(rawSlug);
  const input = packAuthoringSchema.parse(candidate);
  const artRoot = path.join(root, "art", slug);
  const modulePath = path.join(root, "src", "content", "countries", `${slug}.v${input.version}.ts`);
  for (const target of [artRoot, modulePath]) {
    try {
      await stat(target);
      throw new Error(`Refusing to overwrite ${path.relative(root, target)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await mkdir(artRoot, { recursive: true });
  await writeFile(path.join(artRoot, "pack.json"), `${JSON.stringify(input, null, 2)}\n`, "utf8");
  await writeFile(path.join(artRoot, "README.md"), renderPromptReadme(slug, input), "utf8");
  await writeFile(modulePath, renderPackModule(slug, input), "utf8");
}

/** Cross-fades the outer 8% of both edges onto their shared mean so the strip tiles without a seam. */
export function blendTileEdges(data: Buffer, width: number, height: number, channels: number): Buffer {
  const result = Buffer.from(data);
  const blend = Math.max(1, Math.round(width * 0.08));
  for (let y = 0; y < height; y += 1) {
    for (let channel = 0; channel < Math.min(3, channels); channel += 1) {
      const leftEdge = data[(y * width) * channels + channel] ?? 0;
      const rightEdge = data[(y * width + width - 1) * channels + channel] ?? 0;
      const seam = Math.round((leftEdge + rightEdge) / 2);
      for (let offset = 0; offset < blend; offset += 1) {
        const amount = blend === 1 ? 1 : offset / (blend - 1);
        const leftIndex = (y * width + offset) * channels + channel;
        const rightIndex = (y * width + width - 1 - offset) * channels + channel;
        result[leftIndex] = Math.round(seam * (1 - amount) + (data[leftIndex] ?? 0) * amount);
        result[rightIndex] = Math.round(seam * (1 - amount) + (data[rightIndex] ?? 0) * amount);
      }
    }
  }
  return result;
}

export function dominantPalette(data: Buffer, channels: number): [string, string, string] {
  const counts = new Map<number, number>();
  for (let index = 0; index < data.length; index += channels * 12) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    if ((red + green + blue) < 48 || (red + green + blue) > 720) continue;
    const key = (red >> 4) << 8 | (green >> 4) << 4 | (blue >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([key]) => [
    ((key >> 8) & 15) * 17,
    ((key >> 4) & 15) * 17,
    (key & 15) * 17,
  ] as const);
  const picked: Array<readonly [number, number, number]> = [];
  for (const color of ranked) {
    if (picked.every((other) => Math.hypot(color[0] - other[0], color[1] - other[1], color[2] - other[2]) >= 42)) picked.push(color);
    if (picked.length === 3) break;
  }
  const defaults = [[185, 162, 122], [111, 122, 90], [46, 58, 79]] as const;
  while (picked.length < 3) picked.push(defaults[picked.length]!);
  return picked.map((color) => `#${color.map((part) => part.toString(16).padStart(2, "0")).join("")}`) as [string, string, string];
}

export async function writeAtomic(target: string, data: Buffer | string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, data);
  await rename(temporary, target);
}

async function processPanorama(source: string, target: string): Promise<{ palette: [string, string, string]; bytes: number }> {
  const { data, info } = await sharp(source).rotate().resize(3600, 1200, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = await sharp(data, { raw: info }).webp({ quality: 82, effort: 5 }).toBuffer();
  await writeAtomic(target, output);
  return { palette: dominantPalette(data, info.channels), bytes: output.byteLength };
}

async function processSky(source: string, target: string): Promise<number> {
  const { data, info } = await sharp(source)
    .rotate()
    .resize(3600, 1200, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = await sharp(data, { raw: info })
    .extract({ left: 0, top: 0, width: 3600, height: 660 })
    .resize(1600, 900, { fit: "fill" })
    .blur(1.2)
    .webp({ quality: 76, effort: 5 })
    .toBuffer();
  await writeAtomic(target, output);
  return output.byteLength;
}

async function processGround(source: string, target: string): Promise<number> {
  const normalized = await sharp(source)
    .rotate()
    .resize(3600, 1200, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = await sharp(normalized.data, { raw: normalized.info })
    .extract({ left: 0, top: 984, width: 3600, height: 216 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blended = blendTileEdges(data, info.width, info.height, info.channels);
  const output = await sharp(blended, { raw: info }).webp({ quality: 80, effort: 5 }).toBuffer();
  await writeAtomic(target, output);
  return output.byteLength;
}

async function processOptional(source: string, target: string, preserveAlpha = false): Promise<number | null> {
  try {
    await stat(source);
  } catch {
    return null;
  }
  let pipeline = sharp(source).rotate().resize(3600, 1200, { fit: "cover" });
  if (!preserveAlpha) pipeline = pipeline.removeAlpha();
  const output = await pipeline.webp({ quality: 84, effort: 5 }).toBuffer();
  await writeAtomic(target, output);
  return output.byteLength;
}

export async function updateAuthoredRegistry(root: string, slug: string, version: number): Promise<void> {
  const manifestPath = path.join(root, "src", "content", "countries", "authored-packs.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { packs: string[] };
  const packId = `${slug}-v${version}`;
  manifest.packs = [...new Set([...manifest.packs, packId])].sort();
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const refs = manifest.packs.map((item) => {
    const match = item.match(/^(.*)-v(\d+)$/);
    if (!match) throw new Error(`Invalid authored pack id ${item}`);
    return { slug: match[1]!, version: Number(match[2]) };
  });
  const imports = refs.map((item) => `import { ${exportName(item.slug, item.version)} } from "./${item.slug}.v${item.version}";`).join("\n");
  const values = refs.map((item) => `  ${exportName(item.slug, item.version)},`).join("\n");
  await writeAtomic(path.join(root, "src", "content", "countries", "authored.ts"), `${imports}${imports ? "\n" : ""}import type { CountryPack } from "@/lib/content/schema";\n\nexport const authoredCountryPacks: CountryPack[] = [\n${values}${values ? "\n" : ""}];\n`);
}

export async function buildPack(root: string, rawSlug: string, now = new Date()): Promise<PackBuild> {
  const slug = parseSlug(rawSlug);
  const artRoot = path.join(root, "art", slug);
  const input = packAuthoringSchema.parse(JSON.parse(await readFile(path.join(artRoot, "pack.json"), "utf8")));
  const findings = await lintAuthoredContent(root, input);
  if (findings.length > 0) {
    throw new Error(`Banned-topic review required:\n${findings.map((item) => `- ${item.path}: ${item.term}`).join("\n")}`);
  }
  const missing: string[] = [];
  for (const kind of PACK_ZONE_KINDS) {
    const source = path.join(artRoot, "zones", zoneId(slug, kind), "master.png");
    try { await stat(source); } catch { missing.push(path.relative(root, source)); }
  }
  const landmarkNight = path.join(artRoot, "zones", zoneId(slug, "landmark"), "night.png");
  try { await stat(landmarkNight); } catch { missing.push(path.relative(root, landmarkNight)); }
  if (missing.length > 0) throw new Error(`Missing required artwork:\n${missing.map((item) => `- ${item}`).join("\n")}`);

  const build: PackBuild = { schemaVersion: 1, builtAt: now.toISOString(), assetBudgetBytes: 5_767_168, transferBytes: 0, zones: {} };
  for (const kind of PACK_ZONE_KINDS) {
    const id = zoneId(slug, kind);
    const sourceRoot = path.join(artRoot, "zones", id);
    const outputRoot = path.join(root, "public", "scenes", slug, `v${input.version}`, "zones", id);
    const day = await processPanorama(path.join(sourceRoot, "master.png"), path.join(outputRoot, "fallback.webp"));
    const skyBytes = await processSky(path.join(sourceRoot, "master.png"), path.join(outputRoot, "sky.webp"));
    const groundBytes = await processGround(path.join(sourceRoot, "master.png"), path.join(outputRoot, "ground.webp"));
    const nightBytes = await processOptional(path.join(sourceRoot, "night.png"), path.join(outputRoot, "night.webp"));
    const lightsBytes = await processOptional(path.join(sourceRoot, "lights.png"), path.join(outputRoot, "lights.webp"), true);
    const bytes = day.bytes + skyBytes + groundBytes + (nightBytes ?? 0) + (lightsBytes ?? 0);
    build.transferBytes += bytes;
    build.zones[id] = { palette: day.palette, night: nightBytes !== null, lights: lightsBytes !== null, continuous: true, bytes };
  }
  const landmark = path.join(root, "public", "scenes", slug, `v${input.version}`, "zones", zoneId(slug, "landmark"), "fallback.webp");
  const postcard = await sharp(landmark).resize(1200, 630, { fit: "cover" }).webp({ quality: 84, effort: 5 }).toBuffer();
  await writeAtomic(path.join(root, "public", "postcards", slug, `v${input.version}`, "background.webp"), postcard);
  build.transferBytes += postcard.byteLength;
  if (build.transferBytes > build.assetBudgetBytes) throw new Error(`Pack is ${(build.transferBytes / 1_048_576).toFixed(2)} MiB; budget is ${(build.assetBudgetBytes / 1_048_576).toFixed(2)} MiB`);
  await writeAtomic(path.join(artRoot, "build.json"), `${JSON.stringify(build, null, 2)}\n`);
  await writeAtomic(path.join(root, "src", "content", "countries", `${slug}.v${input.version}.ts`), renderPackModule(slug, input, build));
  await updateAuthoredRegistry(root, slug, input.version);
  return build;
}
