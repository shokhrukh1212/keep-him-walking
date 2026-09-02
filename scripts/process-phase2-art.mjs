import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const cityZones = {
  tashkent: ["arrival-boulevard", "mahalla-street", "chorsu-market", "plov-cafe", "evening-landmark"],
  dushanbe: ["rudaki-arrival", "shaded-neighborhood", "mehrgon-market", "chaikhana", "somoni-evening"],
  bishkek: ["ala-too-arrival", "erkindik-boulevard", "osh-bazaar", "boorsok-tea", "mountain-evening"],
  almaty: ["arbat-arrival", "panfilov-park", "green-bazaar", "apple-cafe", "medeu-evening"],
  baku: ["seaside-arrival", "icherisheher", "old-city-market", "armudu-tea", "flame-evening"],
  tbilisi: ["rustaveli-arrival", "balcony-lanes", "dry-bridge", "bakery-courtyard", "abanotubani-evening"],
  istanbul: ["karakoy-arrival", "eminonu-waterfront", "spice-bazaar", "simit-tea", "bosphorus-finale"],
};

function versionFor(city) { return city === "tashkent" ? "v4" : "v1"; }
function sourceMaster(city, zone) {
  return city === "tashkent"
    ? path.join(root, "art", "phase2", city, "zones", `${zone}-master.png`)
    : path.join(root, "art", "phase2", city, "zones", zone, "master.png");
}

async function normalizeMaster(file) {
  return sharp(file).resize(2400, 900, { fit: "cover", position: "centre" }).png().toBuffer();
}

async function processZone(city, zone) {
  const destination = path.join(root, "public", "scenes", city, versionFor(city), "zones", zone);
  await mkdir(destination, { recursive: true });
  const normalized = await normalizeMaster(sourceMaster(city, zone));
  await Promise.all([
    sharp(normalized).extract({ left: 0, top: 0, width: 2400, height: 450 }).resize(2400, 900).blur(0.35).webp({ quality: 70, effort: 6 }).toFile(path.join(destination, "distant.webp")),
    sharp(normalized).extract({ left: 0, top: 162, width: 2400, height: 522 }).webp({ quality: 74, effort: 6 }).toFile(path.join(destination, "architecture.webp")),
    sharp(normalized).resize(1600, 900, { fit: "cover" }).webp({ quality: 78, effort: 6 }).toFile(path.join(destination, "fallback.webp")),
  ]);
  const ground = sharp(normalized).extract({ left: 0, top: 684, width: 2400, height: 216 });
  const groundBuffer = await ground.png().toBuffer();
  await Promise.all([0, 600, 1200].map((left, index) => sharp(groundBuffer)
    .extract({ left, top: 0, width: 1200, height: 216 })
    .webp({ quality: 70, effort: 6 })
    .toFile(path.join(destination, `ground-${index + 1}.webp`))));
}

async function processPropSheet(city) {
  const zones = cityZones[city];
  const destination = path.join(root, "public", "scenes", city, versionFor(city), "props");
  await mkdir(destination, { recursive: true });
  if (city === "tashkent") {
    const sources = ["street-1.webp", "street-3.webp", "street-5.webp"];
    for (const zone of zones) {
      for (let index = 0; index < sources.length; index += 1) {
        const suffix = ["tree", "street-detail", "foreground"][index];
        await copyFile(path.join(root, "public", "scenes", "tashkent", "v3", "props", sources[index]), path.join(destination, `${zone}-${suffix}.webp`));
      }
    }
    return;
  }
  const sheet = path.join(root, "art", "phase2", city, "props", "sheet.png");
  const names = ["tree", "street-detail", "foreground"];
  const columns = await Promise.all(names.map((_, index) => sharp(sheet)
    .extract({ left: index * 512, top: 0, width: 512, height: 1024 })
    .png()
    .toBuffer()));
  const cutouts = await Promise.all(columns.map((column) => sharp(column)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(512, 720, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80, alphaQuality: 90, effort: 6 })
    .toBuffer()));
  for (const zone of zones) {
    await Promise.all(names.map((name, index) => writeFile(path.join(destination, `${zone}-${name}.webp`), cutouts[index])));
  }
}

async function processNpc(city) {
  const source = path.join(root, "art", "phase2", city, "npc", "sheet.png");
  const destination = path.join(root, "public", "npcs", city, versionFor(city));
  await mkdir(destination, { recursive: true });
  const metadata = await sharp(source).metadata();
  const width = Math.floor((metadata.width ?? 1536) / 3);
  const height = metadata.height ?? 1024;
  const columns = await Promise.all([0, 1, 2].map((index) => sharp(source)
    .extract({ left: index * width, top: 0, width, height }).png().toBuffer()));
  await Promise.all(["neutral", "talk", "react"].map((name, index) => sharp(columns[index])
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(560, 900, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 92, effort: 6 })
    .toFile(path.join(destination, `${name}.webp`))));
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => ((state = Math.imul(state ^ (state >>> 15), 1 | state) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
}

function wavBuffer(seed, zoneIndex) {
  const sampleRate = 8000;
  const seconds = 8;
  const count = sampleRate * seconds;
  const pcm = Buffer.alloc(count * 2);
  const random = seeded(seed + zoneIndex * 7919);
  let drift = 0;
  for (let index = 0; index < count; index += 1) {
    drift = drift * 0.985 + (random() * 2 - 1) * 0.015;
    const time = index / sampleRate;
    const tone = Math.sin(time * Math.PI * 2 * (260 + zoneIndex * 37)) * (index % 19000 < 700 ? 0.035 : 0);
    const envelope = Math.sin(Math.PI * index / count) ** 0.4;
    const value = Math.max(-1, Math.min(1, (drift * 0.13 + tone) * envelope));
    pcm.writeInt16LE(Math.round(value * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function processAudio(city) {
  const destination = path.join(root, "public", "audio", city, versionFor(city));
  await mkdir(destination, { recursive: true });
  const citySeed = [...city].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  await Promise.all(cityZones[city].map((zone, index) => writeFile(path.join(destination, `${zone}.wav`), wavBuffer(citySeed, index))));
}

async function processPostcard(city) {
  const zones = cityZones[city];
  const source = sourceMaster(city, zones[zones.length - 1]);
  const destination = path.join(root, "public", "postcards", city, versionFor(city));
  await mkdir(destination, { recursive: true });
  await sharp(source).resize(1600, 1000, { fit: "cover" }).webp({ quality: 82, effort: 6 }).toFile(path.join(destination, "background.webp"));
}

for (const city of Object.keys(cityZones)) {
  for (const zone of cityZones[city]) await processZone(city, zone);
  await Promise.all([processPropSheet(city), processNpc(city), processAudio(city), processPostcard(city)]);
  process.stdout.write(`Processed ${city} (${cityZones[city].length} zones)\n`);
}
