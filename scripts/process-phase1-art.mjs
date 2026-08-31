import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "art", "phase1");
const sceneOut = path.join(root, "public", "scenes", "tashkent", "v1");
const travelerOut = path.join(root, "public", "traveler", "temporary", "v1");
const chefOut = path.join(root, "public", "npcs", "tashkent-chef", "v1");

await Promise.all([
  mkdir(sceneOut, { recursive: true }),
  mkdir(travelerOut, { recursive: true }),
  mkdir(chefOut, { recursive: true }),
]);

const environmentPath = path.join(source, "tashkent-environment-source.png");
const environment = sharp(environmentPath);
const environmentMeta = await environment.metadata();
const envWidth = environmentMeta.width;
const envHeight = environmentMeta.height;
if (!envWidth || !envHeight) throw new Error("Environment dimensions are unavailable");

await sharp(environmentPath)
  .resize({ width: 2000, withoutEnlargement: true })
  .webp({ quality: 88, effort: 5 })
  .toFile(path.join(sceneOut, "scene-fallback.webp"));

const sceneBands = [
  { name: "sky", top: 0, height: Math.round(envHeight * 0.56) },
  {
    name: "city",
    top: Math.round(envHeight * 0.28),
    height: Math.round(envHeight * 0.45),
  },
  {
    name: "street",
    top: Math.round(envHeight * 0.57),
    height: Math.round(envHeight * 0.32),
  },
  {
    name: "foreground",
    top: Math.round(envHeight * 0.79),
    height: envHeight - Math.round(envHeight * 0.79),
  },
];

for (const band of sceneBands) {
  await sharp(environmentPath)
    .extract({ left: 0, top: band.top, width: envWidth, height: band.height })
    .resize({ width: 2000, withoutEnlargement: true })
    .webp({ quality: 86, effort: 5 })
    .toFile(path.join(sceneOut, `${band.name}.webp`));
}

async function assertUsefulAlpha(filePath) {
  const stats = await sharp(filePath).stats();
  const alpha = stats.channels[3];
  if (!alpha || alpha.min >= 250) {
    throw new Error(`${path.basename(filePath)} does not contain useful transparency`);
  }
}

async function cropSheet({ filePath, columns, rows, names, outputDirectory }) {
  await assertUsefulAlpha(filePath);
  const metadata = await sharp(filePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Sprite dimensions unavailable");
  const cellWidth = Math.floor(metadata.width / columns);
  const cellHeight = Math.floor(metadata.height / rows);
  for (let index = 0; index < names.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const width = column === columns - 1 ? metadata.width - column * cellWidth : cellWidth;
    const height = row === rows - 1
      ? metadata.height - row * cellHeight
      : cellHeight - 20;
    const cell = await sharp(filePath)
      .extract({ left: column * cellWidth, top: row * cellHeight, width, height })
      .png()
      .toBuffer();
    const { data, info } = await sharp(cell)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let pixel = 0; pixel < data.length; pixel += info.channels) {
      const alphaIndex = pixel + 3;
      const alpha = data[alphaIndex];
      data[alphaIndex] = alpha < 220
        ? 0
        : Math.min(255, Math.round(((alpha - 220) / 34) * 255));
    }
    const cleaned = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();
    await sharp(cleaned)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({ height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100, effort: 5 })
      .toFile(path.join(outputDirectory, `${names[index]}.webp`));
  }
}

await cropSheet({
  filePath: path.join(source, "traveler-sprite-sheet-source.png"),
  columns: 3,
  rows: 2,
  names: ["idle", "walk", "wave", "phone", "drink", "photo"],
  outputDirectory: travelerOut,
});

await cropSheet({
  filePath: path.join(source, "chef-sprite-sheet-source.png"),
  columns: 3,
  rows: 1,
  names: ["neutral", "talk", "react"],
  outputDirectory: chefOut,
});

process.stdout.write("Processed Phase 1 scene and character assets.\n");
