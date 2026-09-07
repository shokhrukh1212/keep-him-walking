import { mkdir } from "node:fs/promises";
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
const width = 320;
const imageHeight = 180;
const labelHeight = 32;
const rows = Object.entries(cityZones);
const canvas = sharp({ create: { width: width * 5, height: (imageHeight + labelHeight) * rows.length, channels: 4, background: "#0c1922" } });
const composites = [];
for (let row = 0; row < rows.length; row += 1) {
  const [city, zones] = rows[row];
  const version = city === "tashkent" ? "v4" : "v1";
  for (let column = 0; column < zones.length; column += 1) {
    const zone = zones[column];
    const image = await sharp(path.join(root, "public", "scenes", city, version, "zones", zone, "fallback.webp"))
      .resize(width, imageHeight, { fit: "cover" }).toBuffer();
    const label = Buffer.from(`<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#10232d"/><text x="10" y="21" fill="#f7f0df" font-size="12" font-family="Arial">${city} · ${zone}</text></svg>`);
    composites.push({ input: image, left: column * width, top: row * (imageHeight + labelHeight) });
    composites.push({ input: label, left: column * width, top: row * (imageHeight + labelHeight) + imageHeight });
  }
}
await mkdir(path.join(root, "artifacts", "phase2"), { recursive: true });
await canvas.composite(composites).webp({ quality: 84 }).toFile(path.join(root, "artifacts", "phase2", "seven-pack-contact-sheet.webp"));
process.stdout.write("artifacts/phase2/seven-pack-contact-sheet.webp\n");
