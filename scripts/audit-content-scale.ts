import path from "node:path";
import sharp from "sharp";
import { registeredCountryPacks } from "../src/content/countries/registry";
import { readableCountryPackSchema } from "../src/lib/content/schema";
import { auditZoneScale, formatScaleAudit, type ScaleAuditRow } from "../src/lib/world/scale-audit";
import { characterHeightTargetsFromEnv } from "../src/lib/world/stage-targets";

const targets = characterHeightTargetsFromEnv(process.env);
const rows: ScaleAuditRow[] = [];

for (const candidate of registeredCountryPacks()) {
  const pack = readableCountryPackSchema.parse(candidate);
  if (pack.schemaVersion === 1) continue;
  for (const zone of pack.route.zones) {
    const metadata = await sharp(path.join(process.cwd(), "public", zone.fallbackUrl)).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`${pack.assetVersion}/${zone.id}: missing image dimensions`);
    rows.push(auditZoneScale(
      pack.cityName,
      pack.assetVersion,
      zone.id,
      metadata.width,
      metadata.height,
      zone.stage,
      targets,
    ));
  }
}

const generatedOn = new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Tashkent"});
process.stdout.write(formatScaleAudit(rows, generatedOn));
const sanityErrors = rows.flatMap((row) => row.sanityErrors);
if (sanityErrors.length) {
  process.stderr.write(`Artwork scale sanity failed:\n${sanityErrors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
}
