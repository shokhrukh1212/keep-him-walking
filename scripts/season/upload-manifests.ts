/** Upload only the 14 small Season 1 city manifests, dry-run by default. */
import path from "node:path";
import { SEASON_ONE_ROUTE } from "../../src/lib/season/anniversary";
import { runAssetUpload } from "../assets/upload";

const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((argument) => argument !== "--apply")) throw new Error("Usage: pnpm season:assets:upload-manifests [--apply]");
const results = [];
for (const stop of SEASON_ONE_ROUTE) {
  const city = stop.packId.replace(/-v\d+$/, "");
  const version = stop.packId.match(/v\d+$/)?.[0] ?? "v1";
  const prefix = `scenes/${city}/${version}/season1-manifest.json`;
  results.push(await runAssetUpload(
    [...(apply ? ["--upload"] : ["--dry-run"]), "--prefix", prefix],
    process.env,
    path.join(process.cwd(), "public"),
  ));
}
console.log(JSON.stringify({ mode: apply ? "upload" : "dry-run", files: results.reduce((sum, row) => sum + row.files, 0), bytes: results.reduce((sum, row) => sum + row.bytes, 0), uploaded: results.reduce((sum, row) => sum + row.uploaded, 0) }, null, 2));
