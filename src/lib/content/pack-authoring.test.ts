import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  buildPack,
  dominantPalette,
  packAuthoringSchema,
  PACK_ZONE_KINDS,
  scaffoldPack,
  zoneId,
} from "../../../scripts/packs/authoring";
import { findBannedTopics } from "../../../scripts/packs/safety";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const input = {
  country: "Portugal", city: "Lisbon", iso2: "PT", lat: 38.7223, lon: -9.1393,
  timezone: "Europe/Lisbon", neighbours: ["madrid-v1"],
  zones: {
    arrival: "a broad riverside square with tiled facades",
    lanes: "steep residential lanes with balconies and laundry",
    market: "a produce market beneath striped canvas awnings",
    cafe: "two empty tables outside a small pastry cafe",
    landmark: "a public viewpoint looking over the red roofs and river",
  },
  landmark: "Miradouro at dusk",
  localPhrase: { original: "Bem-vindo", transliteration: "Bem-vindo", gloss: "Welcome", pronunciation: "beng VEEN-doo" },
  resident: { name: "Ines", role: "tram conductor", variantId: "lisbon-resident-a" },
  dialogue: [
    { speaker: "npc", text: "Welcome to Lisbon.", mood: "curious" },
    { speaker: "traveler", text: "The hill starts immediately.", mood: "amused" },
    { speaker: "npc", text: "The view will repay it.", mood: "thoughtful" },
    { speaker: "traveler", text: "Which lane should I follow?", mood: "curious" },
    { speaker: "npc", text: "Keep the river on your right.", mood: "neutral" },
    { speaker: "traveler", text: "I will meet you at the top.", mood: "amused" },
  ],
  notebookLines: Array.from({ length: 8 }, (_, index) => `Notebook observation ${index + 1}.`),
  voteBlurb: "Tiled lanes climb from the river to a city of red roofs.",
  postcard: { title: "Lisbon above the river", copy: "The shared walk climbed Lisbon's lanes toward the evening view." },
};

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "khw-pack-"));
  roots.push(root);
  await mkdir(path.join(root, "src", "content", "countries"), { recursive: true });
  await mkdir(path.join(root, "docs", "plan"), { recursive: true });
  await writeFile(path.join(root, "src", "content", "countries", "authored-packs.json"), "{\"packs\":[]}\n");
  await writeFile(path.join(root, "docs", "plan", "content-banned-words.txt"), "politics\nreligion\n");
  return root;
}

describe("pack authoring", () => {
  it("accepts only the documented input slots", () => {
    expect(packAuthoringSchema.parse(input).iso2).toBe("PT");
    expect(() => packAuthoringSchema.parse({ ...input, visitorCaption: "surprise" })).toThrow(/Unrecognized key/);
    expect(() => packAuthoringSchema.parse({ ...input, postcard: { ...input.postcard, subtitle: "surprise" } })).toThrow(/Unrecognized key/);
  });

  it("finds whole banned terms and reports their field", () => {
    expect(findBannedTopics({ dialogue: "No politics here", city: "Metropolitics" }, ["politics"]))
      .toEqual([{ path: "pack.dialogue", term: "politics" }]);
  });

  it("scaffolds prompts and refuses to overwrite the author's work", async () => {
    const root = await fixtureRoot();
    await scaffoldPack(root, "lisbon", input);
    const readme = await readFile(path.join(root, "art", "lisbon", "README.md"), "utf8");
    expect(readme).toContain("five masters");
    expect(readme).toContain("art/lisbon/zones/lisbon-landmark/night.png");
    expect(await readFile(path.join(root, "src", "content", "countries", "lisbon.v1.ts"), "utf8")).toContain("lisbonCountryPackV1");
    await expect(scaffoldPack(root, "lisbon", input)).rejects.toThrow("Refusing to overwrite");
  });

  it("lists every missing required painting before writing a build", async () => {
    const root = await fixtureRoot();
    await scaffoldPack(root, "lisbon", input);
    await expect(buildPack(root, "lisbon")).rejects.toThrow(/lisbon-arrival\/master.png[\s\S]*lisbon-landmark\/night.png/);
  });

  it("builds bounded city art plus a seamless ground and registers the pack deterministically", async () => {
    const root = await fixtureRoot();
    await scaffoldPack(root, "lisbon", input);
    const width = 80;
    const height = 40;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = Math.round(x / (width - 1) * 255);
      pixels[offset + 1] = y % 2 ? 100 : 180;
      pixels[offset + 2] = 255 - pixels[offset];
    }
    for (const kind of PACK_ZONE_KINDS) {
      const folder = path.join(root, "art", "lisbon", "zones", zoneId("lisbon", kind));
      await mkdir(folder, { recursive: true });
      await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(path.join(folder, "master.png"));
    }
    const landmarkFolder = path.join(root, "art", "lisbon", "zones", zoneId("lisbon", "landmark"));
    await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(path.join(landmarkFolder, "night.png"));
    const builtAt = new Date("2026-09-10T12:00:00.000Z");
    const result = await buildPack(root, "lisbon", builtAt);
    expect(result.builtAt).toBe(builtAt.toISOString());
    expect(result.zones["lisbon-landmark"].night).toBe(true);
    expect(new Set(result.zones["lisbon-arrival"].palette).size).toBe(3);
    const output = path.join(root, "public", "scenes", "lisbon", "v1", "zones", "lisbon-arrival", "ground.webp");
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y += 120) {
      const left = data.subarray(y * info.width * info.channels, y * info.width * info.channels + 3);
      const rightOffset = (y * info.width + info.width - 1) * info.channels;
      const right = data.subarray(rightOffset, rightOffset + 3);
      expect(Math.max(...left.map((value, index) => Math.abs(value - (right[index] ?? 0))))).toBeLessThanOrEqual(10);
    }
    expect(await readFile(path.join(root, "src", "content", "countries", "authored-packs.json"), "utf8")).toContain("lisbon");
    const authored = await readFile(path.join(root, "src", "content", "countries", "authored.ts"), "utf8");
    expect(authored).toContain("lisbonCountryPackV1");
    const module = await readFile(path.join(root, "src", "content", "countries", "lisbon.v1.ts"), "utf8");
    expect(module).toContain('"continuousSceneZoneIds"');
  }, 60_000);
});

describe("palette estimation", () => {
  it("returns three colors even for a sparse image", () => {
    expect(dominantPalette(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3)).toHaveLength(3);
  });
});
