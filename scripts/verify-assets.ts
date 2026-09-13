/**
 * Credential-free CDN check for a pack's scene renditions.
 *
 *   pnpm assets:verify --pack paris-v3 --base https://assets.keephimwalking.com
 *   pnpm assets:verify --pack paris-v2 --base http://localhost:3100 --origin http://localhost:3100
 */
import { getCountryPack, registeredCountryPacks } from "../src/content/countries/registry";
import { packAssetPaths, verifyAssetPaths } from "./assets/verify";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const all = process.argv.includes("--all");
const packId = argument("--pack") ?? "paris-v2";
const selected = all ? registeredCountryPacks() : [getCountryPack(packId)];
if (selected.some((pack) => !pack)) throw new Error(`Unknown pack ${packId}`);
const base = argument("--base") ?? process.env.ASSET_BASE_URL;
const origin = argument("--origin") ?? process.env.PRODUCTION_APP_URL ?? "https://keephimwalking.com";
const results = [];
for (const pack of selected) {
  if (!pack) continue;
  const checks = await verifyAssetPaths(packAssetPaths(pack), { base, origin, publicDirectory: "public" });
  const failures = checks.filter((check) => check.problems.length > 0);
  results.push({ pack: pack.assetVersion, checked: checks.length, failed: failures.length, failures });
}
process.stdout.write(`${JSON.stringify({ base, origin, packs: results.length, checked: results.reduce((sum, row) => sum + row.checked, 0), failed: results.reduce((sum, row) => sum + row.failed, 0), results }, null, 2)}\n`);
if (results.some((row) => row.failed > 0)) process.exitCode = 1;
