import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const cities = {
  sofia: ["nevsky-arrival", "yellow-stones", "central-market", "banitsa-cafe", "vitosha-evening"],
  belgrade: ["republic-arrival", "dorcol-streets", "green-market", "riverside-cafe", "kalemegdan-evening"],
  zagreb: ["jelacic-arrival", "upper-town", "dolac-market", "cafe-street", "strossmayer-evening"],
  ljubljana: ["preseren-arrival", "art-nouveau-river", "central-market", "river-cafe", "castle-evening"],
  vienna: ["ringstrasse-arrival", "stephansplatz-lanes", "naschmarkt", "coffeehouse", "belvedere-evening"],
  bratislava: ["michaels-gate", "pastel-old-town", "old-market", "danube-cafe", "castle-evening"],
  prague: ["old-town-arrival", "historic-lanes", "havelske-market", "vltava-cafe", "charles-bridge-evening"],
};

const lineupPath = path.join(root, "art", "phase3", "npc-lineup.png");

async function zoneMaster(city, index) {
  const source = sharp(path.join(root, "art", "phase3", city, "master.png"));
  const metadata = await source.metadata();
  const width = metadata.width ?? 1536;
  const height = metadata.height ?? 896;
  const cropWidth = Math.floor(width * 0.64);
  const left = Math.round((width - cropWidth) * index / 4);
  return source.extract({ left, top: 0, width: cropWidth, height }).resize(2400, 900, { fit: "fill" }).png().toBuffer();
}

async function processZone(city, zone, index) {
  const destination = path.join(root, "public", "scenes", city, "v1", "zones", zone);
  await mkdir(destination, { recursive: true });
  const master = await zoneMaster(city, index);
  await Promise.all([
    sharp(master).extract({ left: 0, top: 0, width: 2400, height: 500 }).resize(2400, 900).blur(0.4).webp({ quality: 68, effort: 6 }).toFile(path.join(destination, "distant.webp")),
    sharp(master).extract({ left: 0, top: 150, width: 2400, height: 560 }).webp({ quality: 74, effort: 6 }).toFile(path.join(destination, "architecture.webp")),
    sharp(master).resize(1600, 900, { fit: "cover" }).webp({ quality: 78, effort: 6 }).toFile(path.join(destination, "fallback.webp")),
    ...[0, 1, 2].map((variant) => sharp(master).extract({ left: variant * 600, top: 684, width: 1200, height: 216 }).webp({ quality: 70, effort: 6 }).toFile(path.join(destination, `ground-${variant + 1}.webp`))),
  ]);
  return master;
}

async function processProps(city, zones, masters) {
  const destination = path.join(root, "public", "scenes", city, "v1", "props");
  await mkdir(destination, { recursive: true });
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
    for (let propIndex = 0; propIndex < 3; propIndex += 1) {
      const size = propIndex === 2 ? 560 : 420;
      const left = [120, 990, 1760][propIndex];
      const crop = await sharp(masters[zoneIndex]).extract({ left, top: 350, width: size, height: 500 }).resize(420, 560, { fit: "cover" }).png().toBuffer();
      const mask = Buffer.from(`<svg width="420" height="560"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset="0.18" stop-color="white"/><stop offset="0.86" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="420" height="560" rx="90" fill="url(#g)"/></svg>`);
      const name = ["tree", "street-detail", "foreground"][propIndex];
      await sharp(crop).joinChannel(mask).webp({ quality: 74, alphaQuality: 82, effort: 6 }).toFile(path.join(destination, `${zones[zoneIndex]}-${name}.webp`));
    }
  }
}

async function processNpc(city, cityIndex) {
  const metadata = await sharp(lineupPath).metadata();
  const columnWidth = Math.floor((metadata.width ?? 1536) / 7);
  const left = cityIndex * columnWidth;
  const width = cityIndex === 6 ? (metadata.width ?? 1536) - left : columnWidth;
  const resized = await sharp(lineupPath)
    .extract({ left, top: 0, width, height: metadata.height ?? 1024 })
    .resize(560, 900, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // The generated contact sheet contains a baked checkerboard. Remove only
  // neutral, bright pixels connected to the crop edge so pale clothing and
  // highlights inside the figure remain intact.
  const { width: outputWidth, height: outputHeight } = resized.info;
  const alpha = Buffer.alloc(outputWidth * outputHeight, 255);
  const visited = new Uint8Array(outputWidth * outputHeight);
  const queue = new Int32Array(outputWidth * outputHeight);
  let head = 0;
  let tail = 0;
  const isBackground = (pixelIndex) => {
    const offset = pixelIndex * 3;
    const red = resized.data[offset];
    const green = resized.data[offset + 1];
    const blue = resized.data[offset + 2];
    return Math.max(red, green, blue) - Math.min(red, green, blue) <= 14
      && (red + green + blue) / 3 >= 214;
  };
  const enqueue = (pixelIndex) => {
    if (!visited[pixelIndex] && isBackground(pixelIndex)) {
      visited[pixelIndex] = 1;
      queue[tail++] = pixelIndex;
    }
  };
  for (let x = 0; x < outputWidth; x += 1) {
    enqueue(x);
    enqueue((outputHeight - 1) * outputWidth + x);
  }
  for (let y = 0; y < outputHeight; y += 1) {
    enqueue(y * outputWidth);
    enqueue(y * outputWidth + outputWidth - 1);
  }
  while (head < tail) {
    const pixelIndex = queue[head++];
    alpha[pixelIndex] = 0;
    const x = pixelIndex % outputWidth;
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < outputWidth) enqueue(pixelIndex + 1);
    if (pixelIndex >= outputWidth) enqueue(pixelIndex - outputWidth);
    if (pixelIndex + outputWidth < outputWidth * outputHeight) enqueue(pixelIndex + outputWidth);
  }

  // Cropping a tightly spaced contact sheet can include a sliver of the next
  // character. Retain the largest connected opaque component (the intended
  // full-body figure) and discard those disconnected edge fragments.
  const labels = new Uint16Array(outputWidth * outputHeight);
  let largestLabel = 0;
  let largestSize = 0;
  let label = 0;
  const componentQueue = new Int32Array(outputWidth * outputHeight);
  for (let start = 0; start < alpha.length; start += 1) {
    if (alpha[start] === 0 || labels[start] !== 0) continue;
    label += 1;
    let componentHead = 0;
    let componentTail = 0;
    labels[start] = label;
    componentQueue[componentTail++] = start;
    while (componentHead < componentTail) {
      const pixelIndex = componentQueue[componentHead++];
      const x = pixelIndex % outputWidth;
      const y = Math.floor(pixelIndex / outputWidth);
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (nextX < 0 || nextX >= outputWidth || nextY < 0 || nextY >= outputHeight) continue;
          const next = nextY * outputWidth + nextX;
          if (alpha[next] !== 0 && labels[next] === 0) {
            labels[next] = label;
            componentQueue[componentTail++] = next;
          }
        }
      }
    }
    if (componentTail > largestSize) {
      largestLabel = label;
      largestSize = componentTail;
    }
  }
  for (let pixelIndex = 0; pixelIndex < alpha.length; pixelIndex += 1) {
    if (labels[pixelIndex] !== largestLabel) alpha[pixelIndex] = 0;
  }
  const transparentNpc = await sharp(resized.data, { raw: { width: outputWidth, height: outputHeight, channels: 3 } })
    .joinChannel(alpha, { raw: { width: outputWidth, height: outputHeight, channels: 1 } })
    .png()
    .toBuffer();
  const destination = path.join(root, "public", "npcs", city, "v1");
  await mkdir(destination, { recursive: true });
  const variants = {
    neutral: sharp(transparentNpc),
    talk: sharp(transparentNpc).affine([[1, 0.008], [-0.008, 1]], { background: { r: 0, g: 0, b: 0, alpha: 0 } }),
    react: sharp(transparentNpc).affine([[1.012, -0.012], [0.012, 1.012]], { background: { r: 0, g: 0, b: 0, alpha: 0 } }),
  };
  await Promise.all(Object.entries(variants).map(([state, pipeline]) => pipeline
    .webp({ quality: 80, alphaQuality: 92, effort: 6 })
    .toFile(path.join(destination, `${state}.webp`))));
}

function wavBuffer(seed, zoneIndex) {
  const sampleRate = 8000; const seconds = 8; const count = sampleRate * seconds;
  const pcm = Buffer.alloc(count * 2); let value = seed + zoneIndex * 7919;
  for (let index = 0; index < count; index += 1) {
    value = (Math.imul(value ^ (value >>> 15), 1 | value) + 0x6d2b79f5) >>> 0;
    const noise = (value / 4294967296 * 2 - 1) * 0.012;
    const tone = Math.sin(index / sampleRate * Math.PI * 2 * (190 + zoneIndex * 23)) * 0.015;
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, noise + tone)) * 32767), index * 2);
  }
  const header = Buffer.alloc(44); header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40); return Buffer.concat([header, pcm]);
}

async function processCity(city, zones, cityIndex) {
  const masters = [];
  for (let index = 0; index < zones.length; index += 1) masters.push(await processZone(city, zones[index], index));
  await processProps(city, zones, masters);
  await processNpc(city, cityIndex);
  const audioDir = path.join(root, "public", "audio", city, "v1"); await mkdir(audioDir, { recursive: true });
  const seed = [...city].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  await Promise.all(zones.map((zone, index) => writeFile(path.join(audioDir, `${zone}.wav`), wavBuffer(seed, index))));
  const postcardDir = path.join(root, "public", "postcards", city, "v1"); await mkdir(postcardDir, { recursive: true });
  await sharp(masters[4]).resize(1600, 1000, { fit: "cover" }).webp({ quality: 82, effort: 6 }).toFile(path.join(postcardDir, "background.webp"));
  process.stdout.write(`Processed Phase 3 editorial pack: ${city}\n`);
}

for (const [index, [city, zones]] of Object.entries(cities).entries()) await processCity(city, zones, index);
