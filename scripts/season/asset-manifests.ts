/** Build fourteen independent R2 scene manifests and an exact local missing-assets report. */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { getCountryPack } from "../../src/content/countries/registry";
import { SEASON_ONE_FALLBACK_IDS } from "../../src/content/countries/season1-fallback";
import { SEASON_ONE_ROUTE } from "../../src/lib/season/anniversary";
import { cityAssetManifest } from "../../src/lib/season/asset-manifest";
import { packAssetPaths } from "../assets/verify";
import { isRemoteOnlyAssetPath } from "../../src/lib/assets/url";

const cwd = process.cwd();
const remoteFiles = new Set(Object.keys((JSON.parse(await readFile("art/brussels/r2-assets.json", "utf8")) as { files: Record<string, unknown> }).files));
const rows = [];
for (const [index, stop] of SEASON_ONE_ROUTE.entries()) {
  const pack = getCountryPack(stop.packId);
  const fallbackOnly = SEASON_ONE_FALLBACK_IDS.has(stop.packId);
  const assets = pack && !fallbackOnly ? packAssetPaths(pack) : [];
  const missing: string[] = [];
  const thumbnail = pack?.postcardBackgroundUrl ?? null;
  if (!pack || fallbackOnly) {
    missing.push(`city-specific reviewed pack for ${stop.packId} (generic fallback only)`);
    missing.push(`public/scenes/${stop.packId.replace(/-v\d+$/, "/v1")}/ (city paintings and renditions)`);
  }
  for (const asset of [...assets, ...(thumbnail ? [thumbnail] : [])]) {
    if (isRemoteOnlyAssetPath(asset)) {
      if (!remoteFiles.has(asset)) missing.push(`R2 inventory: ${asset}`);
      continue;
    }
    try { if (!(await stat(path.join(cwd, "public", asset))).isFile()) missing.push(`public${asset}`); }
    catch { missing.push(`public${asset}`); }
  }
  // The live Paris relaunch began 24 September, after the original anniversary plan.
  // Keep this day's asset inventory aligned to the confirmed production day window.
  const liveWindow = stop.packId === "brussels-v1"
    ? { startsAt: "2026-09-25T18:00:00.000Z", endsAt: "2026-09-26T18:00:00.000Z" }
    : undefined;
  const manifest = cityAssetManifest(index + 1, assets, thumbnail, missing, liveWindow);
  const citySlug = stop.packId.replace(/-v\d+$/, "");
  const version = stop.packId.match(/v\d+$/)?.[0] ?? "v1";
  const directory = path.join(cwd, "public", "scenes", citySlug, version);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "season1-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  rows.push(manifest);
}
await mkdir(path.join(cwd, "artifacts"), { recursive: true });
await writeFile(path.join(cwd, "artifacts", "season1-missing-assets.md"), [
  "# Season 1 asset status", "", "Generated from the route, pack files and committed R2 inventory. A pack's cultural or visual approval is a separate gate.", "",
  ...rows.flatMap((row) => [`## Day ${row.day}: ${row.city}, ${row.country}`, "", `Pack: \`${row.packId}\`; scene files: ${row.fullResolution.length}; thumbnail: \`${row.thumbnail}\`; status: **${row.missing.length ? "missing" : "files present"}**.`, "", ...(row.missing.length ? ["Missing:", "", ...row.missing.map((item) => `- \`${item}\``), ""] : [])]),
].join("\n"));
console.log(JSON.stringify(rows.map(({ day, city, fullResolution, missing }) => ({ day, city, sceneFiles: fullResolution.length, missing })), null, 2));
