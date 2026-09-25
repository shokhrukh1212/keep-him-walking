/** Public trees mirrored by the upload command. Pack paths remain canonical/local. */
export const ASSET_ROOTS = ["characters", "scenes", "audio", "npcs"] as const;
export const BRUSSELS_REMOTE_PREFIX = "/scenes/brussels/v1/";
export const BRUSSELS_REMOTE_ORIGIN = "https://assets.keephimwalking.com";

/** Day 2's paintings live only in R2, including when local development has no asset base. */
export function isRemoteOnlyAssetPath(path: string): boolean {
  return path.startsWith(BRUSSELS_REMOTE_PREFIX);
}

export function validateAssetBaseUrl(value: string | undefined): string {
  const base = value?.trim() ?? "";
  if (!base) return "";
  let url: URL;
  try { url = new URL(base); } catch { throw new Error("ASSET_BASE_URL must be an HTTPS origin"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("ASSET_BASE_URL must be an HTTPS origin without credentials, path, query or fragment");
  }
  return url.origin;
}

/** Pure resolution; explicit base makes build configuration and tests deterministic. */
export function assetUrl(path: string, baseUrl: string | undefined): string {
  const base = validateAssetBaseUrl(baseUrl) || (isRemoteOnlyAssetPath(path) ? BRUSSELS_REMOTE_ORIGIN : "");
  if (!base || !ASSET_ROOTS.some((root) => path.startsWith(`/${root}/`))) return path;
  const pathname = path.split(/[?#]/, 1)[0];
  // Do not let URL normalization escape the mirrored public trees.
  if (pathname.includes("\\") || /%|[\u0000-\u0020]/.test(pathname) || pathname.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Asset path must be a canonical public path");
  }
  return `${base}${path}`;
}

/** Next embeds this non-secret value at build time; credentials never enter the bundle. */
export function publicAssetUrl(path: string): string {
  return assetUrl(path, process.env.NEXT_PUBLIC_ASSET_BASE_URL);
}
