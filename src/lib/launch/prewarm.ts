import type { CountryPack } from "@/lib/content/schema";
import { assetUrl } from "@/lib/assets/url";

const WARMABLE_PREFIXES = ["/characters/", "/scenes/", "/audio/", "/npcs/", "/postcards/"];

/** Collects only checked-in public assets; citations and sponsor URLs are excluded. */
export function packPrewarmPaths(pack: CountryPack): string[] {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      if (WARMABLE_PREFIXES.some((prefix) => value.startsWith(prefix))) found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(pack);
  return [...found].sort();
}

export function prewarmUrl(path: string, assetBaseUrl: string | undefined, appOrigin: string): string {
  const resolved = path.startsWith("/postcards/") ? path : assetUrl(path, assetBaseUrl);
  return new URL(resolved, appOrigin).toString();
}

export function ballotPrewarmPackIds(
  kind: string | null,
  options: ReadonlyArray<{ pack_id?: string | null }>,
): string[] {
  if (kind === "name") return ["dushanbe-v1"];
  return [...new Set(options.flatMap((option) => option.pack_id ? [option.pack_id] : []))];
}
