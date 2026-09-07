import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "art/phase2/traveler/production-v1/action-sheet.png");
const destination = path.join(root, "public/traveler/production/v1");
const actions = [
  "idle", "start-walk", "slow-walk", "stop",
  "notice", "wave", "talk", "listen",
  "react", "phone", "drink", "photo",
  "sit-start", "rest", "goodbye", "resume-walk",
];

function isBackground(red, green, blue) {
  const minimum = Math.min(red, green, blue);
  const maximum = Math.max(red, green, blue);
  return minimum >= 190 && maximum - minimum <= 22;
}

async function removeCheckerboard(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    if (isBackground(data[offset], data[offset + 1], data[offset + 2])) data[offset + 3] = 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function normalizedFrame(input, output) {
  const cleared = await removeCheckerboard(input);
  const trimmed = await sharp(cleared)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const sprite = await sharp(trimmed)
    .resize(300, 590, { fit: "inside" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 360, height: 640, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: sprite, gravity: "south" }])
    .webp({ quality: 86, alphaQuality: 100, effort: 6 })
    .toFile(output);
}

await mkdir(path.join(destination, "actions"), { recursive: true });
await mkdir(path.join(destination, "walk"), { recursive: true });
const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) throw new Error("Traveler action sheet has no dimensions");

for (let index = 0; index < actions.length; index += 1) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  const left = Math.round(column * metadata.width / 4);
  const right = Math.round((column + 1) * metadata.width / 4);
  const top = Math.round(row * metadata.height / 4);
  const bottom = Math.round((row + 1) * metadata.height / 4);
  const cell = await sharp(source)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
  await normalizedFrame(cell, path.join(destination, "actions", `${actions[index]}.webp`));
}

// The approved Phase 1.5 cycle already has the strongest planted-foot sequence.
for (let index = 1; index <= 8; index += 1) {
  await copyFile(
    path.join(root, `public/traveler/temporary/v2/walk-${index}.webp`),
    path.join(destination, "walk", `walk-${index}.webp`),
  );
}

// Keep the complete-body approved poses where the generated contact sheet crops props.
for (const action of ["drink", "photo"]) {
  await copyFile(
    path.join(root, `public/traveler/temporary/v1/${action}.webp`),
    path.join(destination, "actions", `${action}.webp`),
  );
}

process.stdout.write(`Processed ${actions.length} traveler actions and 8 walk frames.\n`);
