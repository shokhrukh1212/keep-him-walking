import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceRoot = path.join(root, "art/phase2/traveler/production-v2");
const destination = path.join(root, "public/traveler/production/v2");

const sheets = [
  {
    file: "walk-sheet.png",
    output: "walk",
    names: Array.from({ length: 8 }, (_, index) => `walk-${index + 1}`),
  },
  {
    file: "action-sheet.png",
    output: "actions",
    names: ["idle", "notice", "wave", "talk", "listen", "react", "phone", "photo"],
  },
  {
    file: "transition-sheet.png",
    output: "actions",
    names: ["start-walk", "slow-walk", "stop", "drink", "rest", "goodbye", "resume-walk", "idle-alt"],
  },
];

function isBakedTransparency(red, green, blue) {
  const minimum = Math.min(red, green, blue);
  const maximum = Math.max(red, green, blue);
  return minimum >= 210 && maximum - minimum <= 34;
}

function isMagentaKey(red, green, blue) {
  return red > 58 && blue > 48 && red - green > 15 && blue - green > 10;
}

async function clearBakedTransparency(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (isMagentaKey(data[0], data[1], data[2])) {
    for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
      const offset = pixel * 4;
      if (isMagentaKey(data[offset], data[offset + 1], data[offset + 2])) data[offset + 3] = 0;
    }
    return sharp(data, { raw: info }).png().toBuffer();
  }
  const visited = new Uint8Array(info.width * info.height);
  const queue = new Int32Array(info.width * info.height);
  let head = 0;
  let tail = 0;
  const enqueue = (pixel) => {
    if (pixel < 0 || pixel >= visited.length || visited[pixel]) return;
    const offset = pixel * 4;
    if (data[offset + 3] === 0 || isBakedTransparency(data[offset], data[offset + 1], data[offset + 2])) {
      visited[pixel] = 1;
      queue[tail++] = pixel;
    }
  };
  for (let x = 0; x < info.width; x += 1) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    enqueue(pixel - info.width);
    enqueue(pixel + info.width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < info.width) enqueue(pixel + 1);
  }
  for (let pixel = 0; pixel < visited.length; pixel += 1) {
    if (visited[pixel]) data[pixel * 4 + 3] = 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function normalizeFrame(input, output) {
  const transparent = await clearBakedTransparency(input);
  const trimmed = await sharp(transparent)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const sprite = await sharp(trimmed)
    .resize(450, 900, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 540, height: 960, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: sprite, gravity: "south" }])
    .webp({ quality: 92, alphaQuality: 100, effort: 4 })
    .toFile(output);
}

const requestedSheet = process.argv[2];
for (const sheet of sheets.filter((candidate) => !requestedSheet || candidate.file === requestedSheet)) {
  const input = path.join(sourceRoot, sheet.file);
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`${sheet.file} has no dimensions`);
  const outputDirectory = path.join(destination, sheet.output);
  await mkdir(outputDirectory, { recursive: true });

  for (let index = 0; index < sheet.names.length; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const left = Math.round(column * metadata.width / 4);
    const right = Math.round((column + 1) * metadata.width / 4);
    const top = Math.round(row * metadata.height / 2);
    const bottom = Math.round((row + 1) * metadata.height / 2);
    const cell = await sharp(input)
      .extract({ left, top, width: right - left, height: bottom - top })
      .png()
      .toBuffer();
    await normalizeFrame(cell, path.join(outputDirectory, `${sheet.names[index]}.webp`));
  }
}

process.stdout.write("Processed production traveler v2: 8 walk frames and 16 action/transition frames.\n");
