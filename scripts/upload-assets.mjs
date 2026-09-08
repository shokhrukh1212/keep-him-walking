import { fileURLToPath } from "node:url";
import { runAssetUpload } from "./assets/upload.ts";

try {
  const result = await runAssetUpload(process.argv.slice(2), process.env, fileURLToPath(new URL("../public/", import.meta.url)));
  console.log(JSON.stringify(result, null, 2));
  if (result.mode === "dry-run") console.log("No requests sent. Use --upload after configuring the bucket credentials; see docs/runbooks/asset-hosting.md.");
} catch (error) {
  // Only our bounded diagnostic messages; no configuration, headers or remote bodies.
  console.error(error instanceof Error ? error.message : "Asset upload failed; check local files and configuration.");
  process.exitCode = 1;
}
