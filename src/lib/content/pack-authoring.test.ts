import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  dominantPalette,
  packAuthoringSchema,
  scaffoldPack,
} from "../../../scripts/packs/authoring";
import { findBannedTopics } from "../../../scripts/packs/safety";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const input = {
  country: "Portugal", city: "Lisbon", iso2: "PT", lat: 38.7223, lon: -9.1393,
  timezone: "Europe/Lisbon", neighbours: ["madrid-v1"],
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
    expect(packAuthoringSchema.parse({
      ...input,
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
    }).culturalReview?.status).toBe("creator_reviewed");
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
    expect(readme).toContain("1–24");
    expect(readme).toContain("art/lisbon/places.json");
    expect(readme).toContain("pnpm pack:build lisbon");
    await expect(scaffoldPack(root, "lisbon", input)).rejects.toThrow("Refusing to overwrite");
  });
});

describe("palette estimation", () => {
  it("returns three colors even for a sparse image", () => {
    expect(dominantPalette(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3)).toHaveLength(3);
  });
});
