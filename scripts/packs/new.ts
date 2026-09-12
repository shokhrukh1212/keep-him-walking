import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { packAuthoringSchema, scaffoldPack, writeAtomic } from "./authoring";
import { conversationsAuthoringSchema, placesAuthoringSchema } from "../scenes/authoring";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const slug = process.argv[2];
if (!slug) throw new Error("Usage: pnpm pack:new <slug> [--from path/to/combined-authoring.json] [--version N]");

let candidate: { pack: unknown; places: unknown; conversations?: unknown };
const from = argument("--from");
if (from) {
  candidate = JSON.parse(await readFile(path.resolve(from), "utf8")) as typeof candidate;
  if (!(candidate && "pack" in candidate && "places" in candidate)) {
    throw new Error("--from must contain { pack, places, conversations? }");
  }
} else {
  const prompt = createInterface({ input, output });
  const ask = async (label: string) => (await prompt.question(`${label}: `)).trim();
  const country = await ask("Country");
  const city = await ask("City");
  const iso2 = await ask("ISO-2 code");
  const lat = Number(await ask("Latitude"));
  const lon = Number(await ask("Longitude"));
  const timezone = await ask("IANA timezone");
  const neighbours = (await ask("Neighbour pack IDs, comma-separated (blank for none)"))
    .split(",").map((value) => value.trim()).filter(Boolean);
  const placeCount = Number(await ask("Approved place count (1–24; target is 10)"));
  const places = [];
  for (let index = 0; index < placeCount; index += 1) {
    const number = index + 1;
    const id = await ask(`Place ${number} stable id`);
    const label = await ask(`Place ${number} label`);
    const tags = (await ask(`Place ${number} semantic tags, comma-separated`))
      .split(",").map((value) => value.trim()).filter(Boolean);
    const description = await ask(`Place ${number} one-line description`);
    const day = await ask(`Place ${number} day painting path inside art/${slug}`);
    const night = await ask(`Place ${number} night painting path, if any (blank for none)`);
    places.push({ id, label, tags, description, day, ...(night ? { night } : {}) });
  }
  const localPhrase = {
    original: await ask("Local phrase — original"), transliteration: await ask("Local phrase — transliteration"),
    gloss: await ask("Local phrase — plain-English meaning"), pronunciation: await ask("Local phrase — pronunciation"),
  };
  const resident = { name: await ask("Resident name"), role: await ask("Resident role"), variantId: await ask("Resident variant ID") };
  const dialogue = [];
  for (let index = 0; index < 6; index += 1) {
    dialogue.push({
      speaker: await ask(`Dialogue ${index + 1} speaker (traveler|npc)`),
      text: await ask(`Dialogue ${index + 1} text`),
      mood: await ask(`Dialogue ${index + 1} mood (neutral|curious|surprised|amused|thoughtful)`),
    });
  }
  const notebookLines = [];
  for (let index = 0; index < 8; index += 1) notebookLines.push(await ask(`Notebook line ${index + 1}`));
  candidate = {
    pack: {
      country, city, iso2, lat, lon, timezone, neighbours, localPhrase, resident, dialogue, notebookLines,
      voteBlurb: await ask("Vote blurb"),
      postcard: { title: await ask("Postcard title"), copy: await ask("Postcard copy") },
    },
    places: {
      packVersion: Number(argument("--version") ?? 2), sceneVisitSeconds: 420, targetPlaceCount: 10, places,
    },
    conversations: { conversations: [] },
  };
  prompt.close();
}

if (argument("--version")) {
  candidate.places = { ...(candidate.places as Record<string, unknown>), packVersion: Number(argument("--version")) };
}
const pack = packAuthoringSchema.parse(candidate.pack);
const places = placesAuthoringSchema.parse(candidate.places);
const conversations = conversationsAuthoringSchema.parse(candidate.conversations ?? { conversations: [] });
await scaffoldPack(process.cwd(), slug, pack);
const artRoot = path.join(process.cwd(), "art", slug);
await writeAtomic(path.join(artRoot, "places.json"), `${JSON.stringify(places, null, 2)}\n`);
await writeAtomic(path.join(artRoot, "conversations.json"), `${JSON.stringify(conversations, null, 2)}\n`);
process.stdout.write(`Created variable manifest for ${places.places.length} place(s). Add only those distinct paintings, then run pnpm pack:build ${slug}.\n`);
