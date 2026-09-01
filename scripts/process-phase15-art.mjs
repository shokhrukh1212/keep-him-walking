import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const routeSource = path.join(root, "art/phase15/tashkent-v2/tashkent-route-zones-source.png");
const walkSource = path.join(root, "art/phase15/tashkent-v2/traveler-walk-cycle-source.png");
const routeRoot = path.join(root, "public/scenes/tashkent/v2/zones");
const travelerRoot = path.join(root, "public/traveler/temporary/v2");
const audioRoot = path.join(root, "public/audio/tashkent/v2");
const npcRoot = path.join(root, "public/npcs/tashkent/v2");
const postcardRoot = path.join(root, "public/postcards/tashkent/v2");

const zones = [
  "arrival-boulevard",
  "mahalla-street",
  "chorsu-market",
  "plov-cafe",
  "evening-landmark",
];

async function processRouteZones() {
  const metadata = await sharp(routeSource).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Route source has no dimensions");

  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    const rawTop = Math.round((index * metadata.height) / zones.length);
    const rawBottom = Math.round(((index + 1) * metadata.height) / zones.length);
    const top = rawTop + (index === 0 ? 0 : 3);
    const bottom = rawBottom - (index === zones.length - 1 ? 0 : 3);
    const height = bottom - top;
    const zoneDir = path.join(routeRoot, zone);
    await mkdir(zoneDir, { recursive: true });

    const bands = [
      { id: "distant", top: 0, height: Math.round(height * 0.48), outputHeight: 300 },
      {
        id: "architecture",
        top: Math.round(height * 0.18),
        height: Math.round(height * 0.64),
        outputHeight: 410,
      },
      {
        id: "ground",
        top: Math.round(height * 0.7),
        height: height - Math.round(height * 0.7),
        outputHeight: 180,
      },
    ];

    for (const band of bands) {
      for (let variant = 0; variant < 3; variant += 1) {
        const left = Math.round((variant * metadata.width) / 3);
        const right = Math.round(((variant + 1) * metadata.width) / 3);
        await sharp(routeSource)
          .extract({
            left,
            top: top + band.top,
            width: right - left,
            height: Math.min(band.height, height - band.top),
          })
          .resize(1_024, band.outputHeight, { fit: "fill" })
          .webp({ quality: 82, effort: 6 })
          .toFile(path.join(zoneDir, `${band.id}-${variant + 1}.webp`));
      }
    }

    await sharp(routeSource)
      .extract({ left: 0, top, width: metadata.width, height })
      .resize(1_600, 900, { fit: "cover", position: "centre" })
      .webp({ quality: 84, effort: 6 })
      .toFile(path.join(zoneDir, "fallback.webp"));
  }

  await mkdir(postcardRoot, { recursive: true });
  const eveningTop = Math.round((4 * metadata.height) / zones.length) + 3;
  await sharp(routeSource)
    .extract({ left: 0, top: eveningTop, width: metadata.width, height: metadata.height - eveningTop })
    .resize(1_600, 900, { fit: "cover" })
    .webp({ quality: 86, effort: 6 })
    .toFile(path.join(postcardRoot, "background.webp"));
}

function isConnectedBackground(r, g, b) {
  return Math.min(r, g, b) >= 232 && Math.max(r, g, b) - Math.min(r, g, b) <= 24;
}

async function removeCheckerboard(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  const queue = new Int32Array(info.width * info.height);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    if (x < 0 || x >= info.width || y < 0 || y >= info.height) return;
    const pixel = y * info.width + x;
    if (visited[pixel]) return;
    const offset = pixel * 4;
    if (!isConnectedBackground(data[offset], data[offset + 1], data[offset + 2])) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  for (let pixel = 0; pixel < visited.length; pixel += 1) {
    const offset = pixel * 4;
    const minimum = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const spread = Math.max(data[offset], data[offset + 1], data[offset + 2]) - minimum;
    // The source contains a baked near-neutral checkerboard. Clear every
    // neutral-light square, including anti-aliased edge pixels, while keeping
    // the traveler's warm shirt and cream highlights (which have wider RGB
    // separation).
    if (visited[pixel] || (minimum >= 190 && spread <= 18)) data[offset + 3] = 0;
  }
  return { data, info };
}

async function processWalkCycle() {
  const metadata = await sharp(walkSource).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Walk source has no dimensions");
  await mkdir(travelerRoot, { recursive: true });

  const source = await sharp(walkSource).raw().toBuffer({ resolveWithObject: true });
  const activeColumns = [];
  for (let x = 0; x < source.info.width; x += 1) {
    let subjectPixels = 0;
    for (let y = 0; y < source.info.height; y += 1) {
      const offset = (y * source.info.width + x) * source.info.channels;
      const red = source.data[offset];
      const green = source.data[offset + 1];
      const blue = source.data[offset + 2];
      if (Math.min(red, green, blue) < 210 || Math.max(red, green, blue) - Math.min(red, green, blue) > 30) {
        subjectPixels += 1;
      }
    }
    activeColumns.push(subjectPixels > 5);
  }
  const runs = [];
  let runStart = null;
  for (let x = 0; x <= activeColumns.length; x += 1) {
    if (activeColumns[x] && runStart === null) runStart = x;
    if ((!activeColumns[x] || x === activeColumns.length) && runStart !== null) {
      if (x - runStart > 20) runs.push([runStart, x - 1]);
      runStart = null;
    }
  }
  if (runs.length !== 8) throw new Error(`Expected 8 walk frames, found ${runs.length}`);

  const clearedSheet = await removeCheckerboard(walkSource);

  for (let index = 0; index < 8; index += 1) {
    const [runLeft, runRight] = runs[index];
    const left = Math.max(0, runLeft - 12);
    const right = Math.min(metadata.width - 1, runRight + 12);
    const extracted = await sharp(clearedSheet.data, {
      raw: {
        width: clearedSheet.info.width,
        height: clearedSheet.info.height,
        channels: 4,
      },
    })
      .extract({ left, top: 0, width: right - left + 1, height: metadata.height })
      .png()
      .toBuffer();
    const trimmed = await sharp(extracted)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp({
      create: { width: 360, height: 640, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: await sharp(trimmed).resize(300, 590, { fit: "inside" }).png().toBuffer(), gravity: "south" }])
      .webp({ quality: 88, alphaQuality: 100, effort: 6 })
      .toFile(path.join(travelerRoot, `walk-${index + 1}.webp`));
  }
}

function makeAmbientWav(seed) {
  const sampleRate = 22_050;
  const seconds = 4;
  const samples = sampleRate * seconds;
  const output = Buffer.alloc(44 + samples * 2);
  output.write("RIFF", 0);
  output.writeUInt32LE(output.length - 8, 4);
  output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(samples * 2, 40);
  let random = seed >>> 0;
  for (let index = 0; index < samples; index += 1) {
    random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
    const noise = (random / 0xffffffff) * 2 - 1;
    const breeze = Math.sin((index / sampleRate) * Math.PI * 2 * (0.12 + seed * 0.005));
    const bird = index % (6_000 + seed * 37) < 300
      ? Math.sin((index / sampleRate) * Math.PI * 2 * (1_100 + seed * 23)) * 0.08
      : 0;
    const value = Math.max(-1, Math.min(1, noise * 0.035 + breeze * 0.025 + bird));
    output.writeInt16LE(Math.round(value * 32_767), 44 + index * 2);
  }
  return output;
}

async function processSupportingAssets() {
  await mkdir(audioRoot, { recursive: true });
  for (let index = 0; index < zones.length; index += 1) {
    await writeFile(path.join(audioRoot, `${zones[index]}.wav`), makeAmbientWav(19 + index * 17));
  }
  await mkdir(npcRoot, { recursive: true });
  for (const state of ["neutral", "talk", "react"]) {
    await copyFile(
      path.join(root, `public/npcs/tashkent-chef/v1/${state}.webp`),
      path.join(npcRoot, `${state}.webp`),
    );
  }
}

await Promise.all([processRouteZones(), processWalkCycle(), processSupportingAssets()]);
const sourceBytes = (await readFile(routeSource)).byteLength + (await readFile(walkSource)).byteLength;
process.stdout.write(`Processed Phase 1.5 art from ${sourceBytes.toLocaleString()} source bytes.\n`);
