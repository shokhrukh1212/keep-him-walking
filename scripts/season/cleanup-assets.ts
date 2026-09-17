/**
 * Delete a completed day's full-resolution R2 scene objects only after all guards pass.
 * Usage: pnpm season:assets:cleanup --day N [--apply]
 * The default is a dry run. This never removes the manifest or history thumbnail.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SEASON_ONE_ROUTE } from "../../src/lib/season/anniversary";
import { cleanupEligible, type CityAssetManifest } from "../../src/lib/season/asset-manifest";
import { signAssetDelete, uploadConfig } from "../assets/upload";

const args = process.argv.slice(2);
const dayIndex = args.indexOf("--day");
const day = Number(args[dayIndex + 1]);
const apply = args.includes("--apply");
if (dayIndex < 0 || !Number.isInteger(day) || day < 1 || day >= SEASON_ONE_ROUTE.length || args.some((arg, index) => !["--day", "--apply"].includes(arg) && index !== dayIndex + 1)) {
  throw new Error("Usage: pnpm season:assets:cleanup --day N [--apply]; N must be a completed day before Day 14");
}
const readManifest = async (number: number) => {
  const stop = SEASON_ONE_ROUTE[number - 1]!;
  const slug = stop.packId.replace(/-v\d+$/, "");
  const version = stop.packId.match(/v\d+$/)?.[0] ?? "v1";
  const file = path.join(process.cwd(), "public", "scenes", slug, version, "season1-manifest.json");
  return JSON.parse(await readFile(file, "utf8")) as CityAssetManifest;
};
const manifests = await Promise.all(SEASON_ONE_ROUTE.map((_, index) => readManifest(index + 1)));
const target = manifests[day - 1]!;
const next = manifests[day]!;
const origin = process.env.ASSET_BASE_URL?.replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!origin || !supabaseUrl || !supabaseKey) throw new Error("ASSET_BASE_URL and dev Supabase service credentials are required even for dry-run");
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: journey, error: journeyError } = await supabase.from("journeys").select("id").eq("season_number", 1).maybeSingle();
if (journeyError || !journey) throw new Error("Season 1 journey is unavailable");
const { data: rows, error: rowsError } = await supabase.from("country_days")
  .select("id,day_number,scene_pack_id,status,postcard_background_url")
  .eq("journey_id", journey.id).order("day_number", { ascending: true });
if (rowsError || !rows) throw new Error("Season 1 day rows are unavailable");
const completed = rows.find((row) => row.day_number === day);
const nextRow = rows.find((row) => row.day_number === day + 1);
const [{ data: postcardRows, error: postcardError }, { data: photoRows, error: photoError }] = await Promise.all([
  supabase.from("postcards").select("image_path,og_image_path").eq("country_day_id", completed?.id ?? "00000000-0000-0000-0000-000000000000"),
  supabase.from("day_photos").select("storage_path").eq("country_day_id", completed?.id ?? "00000000-0000-0000-0000-000000000000"),
]);
if (postcardError || photoError) throw new Error("Completed-day history references could not be checked");
const currentDay = rows.find((row) => row.status === "live")?.day_number
  ?? (Math.max(0, ...rows.filter((row) => row.status === "completed").map((row) => row.day_number)) + 1);
const futureReferences = manifests.slice(day).flatMap((manifest) => [manifest.thumbnail, ...manifest.fullResolution]);
const historyReferences = [
  ...rows.map((row) => row.postcard_background_url),
  ...(postcardRows ?? []).flatMap((row) => [row.image_path, row.og_image_path]),
  ...(photoRows ?? []).map((row) => row.storage_path),
].filter(Boolean) as string[];
const shared = target.fullResolution.filter((asset) => futureReferences.includes(asset) || historyReferences.includes(asset));
const nextComplete = next.missing.length === 0 && next.fullResolution.length > 0
  && nextRow?.scene_pack_id === next.packId;
const eligible = cleanupEligible({
  day, currentDay, completed: completed?.status === "completed" && completed.scene_pack_id === target.packId,
  nextComplete, thumbnail: target.thumbnail, fullResolution: target.fullResolution,
});
if (!eligible || target.missing.length || !target.fullResolution.length || shared.length) {
  throw new Error(`Cleanup refused: completed=${completed?.status === "completed"}, currentDay=${currentDay}, nextComplete=${nextComplete}, targetMissing=${target.missing.length}, sharedOrHistoryReferences=${shared.length}`);
}
if (apply) {
  // A local manifest is insufficient: verify every next-city file is currently on R2.
  for (const asset of next.fullResolution) {
    const response = await fetch(`${origin}${asset}`, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Next city incomplete on R2: ${asset} (HTTP ${response.status})`);
  }
}
console.log(JSON.stringify({ mode: apply ? "delete" : "dry-run", day, city: target.city, currentDay, nextCity: next.city, objects: target.fullResolution }, null, 2));
if (!apply) process.exit(0);
const config = uploadConfig(process.env);
for (const asset of target.fullResolution) {
  if (!asset.startsWith(`/scenes/${target.packId.replace(/-v\d+$/, "")}/`)) throw new Error(`Foreign scene path: ${asset}`);
  const signed = signAssetDelete(config, asset.slice(1), new Date());
  const response = await fetch(signed.url, { method: "DELETE", headers: signed.headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`R2 refused deletion of ${asset}: HTTP ${response.status}`);
  await response.body?.cancel();
}
console.log(`Deleted ${target.fullResolution.length} completed-city scene objects from R2.`);
