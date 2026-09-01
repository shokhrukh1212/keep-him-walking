import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceRoot = path.join(root, "art/phase15/tashkent-v3");
const outputRoot = path.join(root, "public/scenes/tashkent/v3");
const postcardRoot = path.join(root, "public/postcards/tashkent/v3");
const zones = [
  "arrival-boulevard",
  "mahalla-street",
  "chorsu-market",
  "plov-cafe",
  "evening-landmark",
];

async function removeGeneratedEdgeFringe(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  const channels = info.channels;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      const vividGeneratedOutline =
        (red > 232 && green < 82 && blue < 82) ||
        (red > 236 && green > 208 && blue < 68);
      const fringeColor =
        (red > 170 && green < 105 && blue < 90) ||
        (red > 205 && green > 165 && green < 235 && blue < 90);
      if ((!fringeColor && !vividGeneratedOutline) || alpha === 0) continue;
      if (vividGeneratedOutline) {
        output[offset + 3] = 0;
        continue;
      }
      let touchesTransparency = false;
      for (let dy = -8; dy <= 8 && !touchesTransparency; dy += 1) {
        for (let dx = -8; dx <= 8; dx += 1) {
          const nearX = x + dx;
          const nearY = y + dy;
          if (nearX < 0 || nearX >= info.width || nearY < 0 || nearY >= info.height) {
            touchesTransparency = true;
            break;
          }
          if (data[(nearY * info.width + nearX) * channels + 3] < 12) {
            touchesTransparency = true;
            break;
          }
        }
      }
      if (touchesTransparency) output[offset + 3] = 0;
    }
  }
  return sharp(output, { raw: info }).png().toBuffer();
}

async function mirroredGround(source, left, width, height, variant) {
  const saturation = 0.78 + (variant % 4) * 0.025;
  const brightness = 0.91 + (variant % 3) * 0.015;
  const half = await sharp(source)
    .extract({ left, top: height - 210, width, height: 210 })
    .resize(600, 190, { fit: "fill" })
    .modulate({ saturation, brightness })
    .png()
    .toBuffer();
  const reflected = await sharp(half).flop().png().toBuffer();
  const strip = await sharp({
    create: {
      width: 1_200,
      height: 190,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: half, left: 0, top: 0 },
      { input: reflected, left: 600, top: 0 },
    ])
    .png()
    .toBuffer();
  const featherMask = Buffer.from(
    `<svg width="1200" height="190" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset="0.3" stop-color="white" stop-opacity="0.88"/><stop offset="0.52" stop-color="white" stop-opacity="1"/></linearGradient></defs><rect width="1200" height="190" fill="url(#fade)"/></svg>`,
  );
  return sharp(strip)
    .composite([{ input: featherMask, blend: "dest-in" }])
    .webp({ quality: 84, effort: 6 })
    .toBuffer();
}

async function processZones() {
  for (const zone of zones) {
    const source = path.join(sourceRoot, "zones", `${zone}.png`);
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`${zone} has no dimensions`);
    const destination = path.join(outputRoot, "zones", zone);
    await mkdir(destination, { recursive: true });

    const panorama = await sharp(source)
      .resize(2_400, 900, { fit: "cover", position: "centre" })
      .webp({ quality: 86, effort: 6 })
      .toBuffer();
    await sharp(panorama).toFile(path.join(destination, "panorama.webp"));
    await sharp(panorama).toFile(path.join(destination, "fallback.webp"));

    const cropWidth = Math.min(600, metadata.width);
    const leftPositions = [
      0,
      Math.max(0, Math.round((metadata.width - cropWidth) / 2)),
      Math.max(0, metadata.width - cropWidth),
    ];
    for (let index = 0; index < leftPositions.length; index += 1) {
      const ground = await mirroredGround(
        source,
        leftPositions[index],
        cropWidth,
        metadata.height,
        index,
      );
      await sharp(ground).toFile(path.join(destination, `ground-${index + 1}.webp`));
    }
  }

  await mkdir(postcardRoot, { recursive: true });
  await sharp(path.join(sourceRoot, "zones", "evening-landmark.png"))
    .resize(1_600, 900, { fit: "cover" })
    .webp({ quality: 88, effort: 6 })
    .toFile(path.join(postcardRoot, "background.webp"));
}

async function processPropSheet(sheetName) {
  const source = path.join(sourceRoot, "props", `${sheetName}-props.png`);
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`${sheetName} prop sheet has no dimensions`);
  const destination = path.join(outputRoot, "props");
  await mkdir(destination, { recursive: true });

  const bounds = sheetName === "street"
    ? [[535, 844], [535, 844], [869, 955], [1_019, 1_315], [1_378, 1_617], [1_656, 2_033]]
    : [[25, 416], [445, 828], [870, 1_218], [1_255, 1_531], [1_546, 1_992], [2_022, 2_123]];
  for (let index = 0; index < bounds.length; index += 1) {
    const [left, right] = bounds[index];
    const extracted = await sharp(source)
      .extract({ left, top: 0, width: right - left, height: metadata.height })
      .png()
      .toBuffer();
    let cell = await sharp(extracted)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    cell = await removeGeneratedEdgeFringe(cell);
    if (sheetName === "street" && index === 1) {
      cell = await sharp(cell).flop().png().toBuffer();
    }
    const normalized = await sharp(cell)
      .resize(480, 600, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: 512,
        height: 640,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: normalized, gravity: "south" }])
      .webp({ quality: 88, alphaQuality: 100, effort: 6 })
      .toFile(path.join(destination, `${sheetName}-${index + 1}.webp`));
  }
}

await Promise.all([processZones(), processPropSheet("street"), processPropSheet("market")]);
process.stdout.write("Processed Tashkent v3 panoramas, seamless ground tracks and illustrated props.\n");
