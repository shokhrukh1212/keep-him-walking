import { stat } from "node:fs/promises";
import path from "node:path";
import type { CountryPack } from "../../src/lib/content/schema";
import { assetUrl, validateAssetBaseUrl } from "../../src/lib/assets/url";
import { cacheControlFor } from "./upload";

/**
 * Checks, without credentials, that a public asset origin (the owner's R2 custom
 * domain, or the application itself) serves a pack's renditions the way the
 * browser needs them: reachable, the right type, cacheable for a year when
 * content-addressed, readable by WebGL across origins, and byte-identical to the
 * checked-in file.
 */

const MIME: Record<string, string> = {
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary", ".wav": "audio/wav",
};

export type AssetCheck = { path: string; url: string; problems: string[] };

/** Every rendition a pack can ask a browser for, or the single painting of an older pack. */
export function packAssetPaths(pack: CountryPack): string[] {
  return [...new Set(pack.route.zones.flatMap((zone) => zone.variants
    ? [...zone.variants.city, ...zone.variants.sky, ...zone.variants.ground, ...zone.variants.night].map((variant) => variant.url)
    : [zone.fallbackUrl, ...(zone.continuousScene ? [zone.continuousScene.skyUrl, zone.continuousScene.groundUrl] : [])]))].sort();
}

export async function verifyAssetPaths(
  paths: readonly string[],
  options: {
    base: string | undefined;
    origin: string;
    publicDirectory: string;
    fetcher?: typeof fetch;
    concurrency?: number;
  },
): Promise<AssetCheck[]> {
  const base = validateAssetBaseUrl(options.base);
  if (!base) throw new Error("Provide the public asset origin with --base or ASSET_BASE_URL");
  const fetcher = options.fetcher ?? fetch;
  const results: AssetCheck[] = [];
  let cursor = 0;
  const checkOne = async (assetPath: string): Promise<AssetCheck> => {
    const url = assetUrl(assetPath, base);
    const problems: string[] = [];
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "HEAD",
        headers: { Origin: options.origin },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { path: assetPath, url, problems: ["unreachable"] };
    }
    if (!response.ok) problems.push(`HTTP ${response.status}`);
    const expectedType = MIME[path.extname(assetPath).toLowerCase()];
    const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
    if (expectedType && type !== expectedType) problems.push(`content-type ${type ?? "missing"}, expected ${expectedType}`);
    const cache = response.headers.get("cache-control") ?? "";
    if (cacheControlFor(assetPath.slice(1)).includes("immutable")
      && (!/\bimmutable\b/.test(cache) || !/max-age=31536000\b/.test(cache))) {
      problems.push(`cache-control "${cache || "missing"}" is not a one-year immutable cache`);
    }
    const allowOrigin = response.headers.get("access-control-allow-origin");
    if (allowOrigin !== "*" && allowOrigin !== options.origin) {
      problems.push(`no CORS permission for ${options.origin}`);
    }
    const length = Number(response.headers.get("content-length"));
    try {
      const local = (await stat(path.join(options.publicDirectory, assetPath))).size;
      if (Number.isFinite(length) && response.headers.has("content-length") && length !== local) {
        problems.push(`serves ${length} bytes, the checked-in file has ${local}`);
      }
    } catch {
      problems.push("no checked-in file to compare");
    }
    return { path: assetPath, url, problems };
  };
  const worker = async () => {
    while (cursor < paths.length) {
      const next = paths[cursor++]!;
      results.push(await checkOne(next));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 6, paths.length)) }, worker));
  return results.sort((left, right) => left.path.localeCompare(right.path));
}
