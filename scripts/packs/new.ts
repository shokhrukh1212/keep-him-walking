import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { packAuthoringSchema, PACK_ZONE_KINDS, scaffoldPack } from "./authoring";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const slug = process.argv[2];
if (!slug) throw new Error("Usage: pnpm pack:new <slug> [--from path/to/pack.json]");

const from = argument("--from");
let candidate: unknown;
if (from) {
  candidate = JSON.parse(await readFile(path.resolve(from), "utf8"));
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
  const zoneEntries: Array<[string, string]> = [];
  for (const kind of PACK_ZONE_KINDS) zoneEntries.push([kind, await ask(`${kind} one-line scene`)]);
  const zones = Object.fromEntries(zoneEntries);
  const landmark = await ask("Landmark");
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
    version: Number(argument("--version") ?? 1),
    country, city, iso2, lat, lon, timezone, neighbours,
    zones,
    landmark,
    localPhrase,
    resident,
    dialogue,
    notebookLines,
    voteBlurb: await ask("Vote blurb"),
    postcard: { title: await ask("Postcard title"), copy: await ask("Postcard copy") },
  };
  prompt.close();
}

if (argument("--version")) candidate = { ...(candidate as Record<string, unknown>), version: Number(argument("--version")) };
const parsed = packAuthoringSchema.parse(candidate);
await scaffoldPack(process.cwd(), slug, parsed);
process.stdout.write(`Created src/content/countries/${slug}.v${parsed.version}.ts and art/${slug}/. Add the six required paintings, then run pnpm pack:build ${slug}.\n`);
