/**
 * Credential-free CDN check for a pack's scene renditions.
 *
 *   pnpm assets:verify --pack paris-v3 --base https://assets.keephimwalking.com
 *   pnpm assets:verify --pack paris-v2 --base http://localhost:3100 --origin http://localhost:3100
 */
import { getCountryPack } from "../src/content/countries/registry";
import { packAssetPaths, verifyAssetPaths } from "./assets/verify";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const packId = argument("--pack") ?? "paris-v2";
const pack = getCountryPack(packId);
if (!pack) throw new Error(`Unknown pack ${packId}`);
const base = argument("--base") ?? process.env.ASSET_BASE_URL;
const origin = argument("--origin") ?? process.env.PRODUCTION_APP_URL ?? "https://keephimwalking.com";
const checks = await verifyAssetPaths(packAssetPaths(pack), { base, origin, publicDirectory: "public" });
const failed = checks.filter((check) => check.problems.length > 0);
process.stdout.write(`${JSON.stringify({ pack: packId, base, origin, checked: checks.length, failed: failed.length, failures: failed }, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
