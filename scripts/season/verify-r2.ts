/** Verify each Season 1 city manifest's scene files against the public R2 origin. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEASON_ONE_ROUTE } from "../../src/lib/season/anniversary";
import type { CityAssetManifest } from "../../src/lib/season/asset-manifest";
import { verifyAssetPaths } from "../assets/verify";

const remoteBytes = Object.fromEntries(Object.entries((JSON.parse(await readFile("art/brussels/r2-assets.json", "utf8")) as {
  files: Record<string, { bytes: number }>;
}).files).map(([url, file]) => [url, file.bytes]));

const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : process.env.ASSET_BASE_URL;
if (!base) throw new Error("Pass --base https://your-R2-asset-origin");
const results = [];
for (const stop of SEASON_ONE_ROUTE) {
  const city = stop.packId.replace(/-v\d+$/, "");
  const version = stop.packId.match(/v\d+$/)?.[0] ?? "v1";
  const file = path.join("public", "scenes", city, version, "season1-manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as CityAssetManifest;
  const checks = manifest.fullResolution.length
    ? await verifyAssetPaths(manifest.fullResolution, { base, origin: "https://keephimwalking.com", publicDirectory: "public", concurrency: 6, expectedBytes: remoteBytes })
    : [];
  results.push({
    day: manifest.day, city: manifest.city, packId: manifest.packId,
    localMissing: manifest.missing, r2Checked: checks.length,
    r2Failures: checks.filter((check) => check.problems.length).map((check) => ({ path: check.path, problems: check.problems })),
  });
}
await writeFile("artifacts/season1-r2-status.json", `${JSON.stringify({ base, checkedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify(results.map((row) => ({ day: row.day, city: row.city, checked: row.r2Checked, failed: row.r2Failures.length, localMissing: row.localMissing.length })), null, 2));
if (results.some((row) => row.r2Failures.length)) process.exitCode = 1;
