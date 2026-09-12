import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const moodSchema = z.enum(["neutral", "curious", "surprised", "amused", "thoughtful"]);

export const packAuthoringSchema = z.object({
  country: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  iso2: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().min(3).max(80),
  neighbours: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/)),
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

export function parseSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Pack slug must contain lowercase letters, numbers and single hyphens only");
  }
  return slug;
}

export function exportName(slug: string, version: number): string {
  return `${slug.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())}CountryPackV${version}`;
}

export function renderPromptReadme(slug: string, input: PackAuthoring): string {
  return `# ${input.city} artwork

The ordered place list lives in \`art/${slug}/places.json\`. It accepts 1–24
distinct places and targets ten. Keep stable place IDs and semantic tags such as
\`cafe\` and \`landmark\`; a day/night pair belongs to one place.

Keep every source painting. Save each approved source at the path named by that
place's \`day\` field, with an optional \`night\` source beside it. The build never
generates, duplicates or replaces artwork.

Run \`pnpm pack:build ${slug}\` (or \`pnpm scenes:build ${slug}\`). Both commands
build the same versioned, variable-length manifest and immutable renditions.
`;
}

export async function scaffoldPack(root: string, rawSlug: string, candidate: unknown): Promise<void> {
  const slug = parseSlug(rawSlug);
  const input = packAuthoringSchema.parse(candidate);
  const artRoot = path.join(root, "art", slug);
  try {
    await stat(artRoot);
    throw new Error(`Refusing to overwrite ${path.relative(root, artRoot)}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(artRoot, { recursive: true });
  await writeFile(path.join(artRoot, "pack.json"), `${JSON.stringify(input, null, 2)}\n`, "utf8");
  await writeFile(path.join(artRoot, "README.md"), renderPromptReadme(slug, input), "utf8");
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
