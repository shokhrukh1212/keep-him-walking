import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildScenePack, type SceneBuildOptions } from "../../../scripts/scenes/authoring";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const SMALL: SceneBuildOptions = {
  nominalWidth: 360,
  nominalHeight: 120,
  cityWidths: [180, 360],
  centerWidths: [60, 120],
  skyWidths: [80, 160],
  groundWidths: [180, 360],
  skyTopRows: 66,
  groundRows: 22,
};

const pack = {
  country: "Portugal", city: "Lisbon", iso2: "PT", lat: 38.7223, lon: -9.1393,
  timezone: "Europe/Lisbon", neighbours: [],
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
  voteBlurb: "Tiled lanes climb from the river.",
  postcard: { title: "Lisbon above the river", copy: "The shared walk climbed Lisbon's lanes." },
  culturalReview: {
    reviewerName: "Content owner",
    reviewedAt: "2026-09-13T00:00:00.000Z",
    status: "creator_reviewed",
    qualification: "Owner visual and dialogue review",
    disposition: "Approved for the candidate journey",
    publicLaunchRequirement: "Qualified local review remains required before public launch.",
    citations: [],
    notes: "Owner acceptance recorded.",
  },
};

async function painting(file: string, hue: number) {
  const width = 90;
  const height = 30;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    pixels[offset] = (x * 3 + hue) % 256;
    pixels[offset + 1] = (y * 7 + hue * 2) % 256;
    pixels[offset + 2] = (255 - x * 2 + hue) % 256;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(file);
}

async function fixture(places: Array<{ id: string; tags: string[]; day: string; night?: string }>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "khw-scenes-"));
  roots.push(root);
  await mkdir(path.join(root, "src", "content", "countries"), { recursive: true });
  await mkdir(path.join(root, "docs", "plan"), { recursive: true });
  await writeFile(path.join(root, "src", "content", "countries", "authored-packs.json"), "{\"packs\":[]}\n");
  await writeFile(path.join(root, "docs", "plan", "content-banned-words.txt"), "politics\n");
  const art = path.join(root, "art", "lisbon");
  await mkdir(art, { recursive: true });
  await writeFile(path.join(art, "pack.json"), JSON.stringify(pack));
  await writeFile(path.join(art, "places.json"), JSON.stringify({
    packVersion: 2,
    places: places.map((place) => ({ ...place, label: place.id, description: `The ${place.id}.` })),
  }));
  await writeFile(path.join(art, "conversations.json"), JSON.stringify({ conversations: [{
    id: "lisbon-hello", placeTags: ["arrival"], lines: [{ speaker: "npc", text: "Bom dia!", mood: "neutral" }],
  }] }));
  return { root, art };
}

describe("scene manifest build", () => {
  it("writes content-addressed renditions for every place and registers the manifest", async () => {
    const { root, art } = await fixture([
      { id: "lisbon-arrival", tags: ["arrival"], day: "places/lisbon-arrival/day.png" },
      { id: "lisbon-viewpoint", tags: ["landmark", "river"], day: "places/lisbon-viewpoint/day.png", night: "places/lisbon-viewpoint/night.png" },
    ]);
    await painting(path.join(art, "places/lisbon-arrival/day.png"), 10);
    await painting(path.join(art, "places/lisbon-viewpoint/day.png"), 120);
    await painting(path.join(art, "places/lisbon-viewpoint/night.png"), 200);
    const staleDirectory = path.join(root, "public", "scenes", "lisbon", "v2", "places", "lisbon-arrival");
    await mkdir(staleDirectory, { recursive: true });
    await writeFile(path.join(staleDirectory, "city-full-360.0000000000.webp"), "stale");
    await writeFile(path.join(staleDirectory, "owner-notes.txt"), "kept");

    const report = await buildScenePack(root, "lisbon", SMALL, new Date("2026-09-12T12:00:00Z"));
    expect(report).toMatchObject({ packId: "lisbon-v2", placeCount: 2, targetPlaceCount: 10 });
    expect(report.warnings).toEqual(["2 of 10 target places; add approved paintings and rebuild as a new version"]);
    expect(report.places["lisbon-viewpoint"]!.night).toBe(true);

    const names = (await readdir(staleDirectory)).sort();
    expect(names).toContain("owner-notes.txt");
    expect(names).not.toContain("city-full-360.0000000000.webp");
    expect(names.filter((name) => name.endsWith(".webp"))).toHaveLength(8);
    for (const name of names.filter((entry) => entry.endsWith(".webp"))) {
      expect(name).toMatch(/^(city|sky|ground)-(full|center)-\d+\.[0-9a-f]{10}\.webp$/);
    }

    const generated = await readFile(path.join(root, "src", "content", "countries", "lisbon.v2.ts"), "utf8");
    expect(generated).toContain("lisbonCountryPackV2");
    expect(generated).toContain("\"sceneVisitSeconds\": 420");
    expect(generated).toContain("\"status\": \"creator_reviewed\"");
    expect(generated).toContain("/scenes/lisbon/v2/places/lisbon-viewpoint/night-center-120.");
    expect(await readFile(path.join(root, "src", "content", "countries", "authored.ts"), "utf8")).toContain("lisbonCountryPackV2");

    const again = await buildScenePack(root, "lisbon", SMALL, new Date("2026-09-12T12:00:00Z"));
    expect(again.places).toEqual(report.places);
  }, 60_000);

  it("refuses to make a place out of another place's painting", async () => {
    const { root, art } = await fixture([
      { id: "lisbon-arrival", tags: ["arrival"], day: "places/shared/day.png" },
      { id: "lisbon-copy", tags: ["lanes"], day: "places/shared/day.png" },
    ]);
    await painting(path.join(art, "places/shared/day.png"), 42);
    await expect(buildScenePack(root, "lisbon", SMALL)).rejects.toThrow(/uses the same painting as lisbon-arrival/);
  }, 60_000);

  it("lists missing paintings before writing anything", async () => {
    const { root } = await fixture([{ id: "lisbon-arrival", tags: ["arrival"], day: "places/lisbon-arrival/day.png" }]);
    await expect(buildScenePack(root, "lisbon", SMALL)).rejects.toThrow(/Missing required artwork[\s\S]*lisbon-arrival\/day.png/);
  });
});
