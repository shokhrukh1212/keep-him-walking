/** Public trees mirrored by the upload command. Pack paths remain canonical/local. */
export const ASSET_ROOTS = ["characters", "scenes", "audio", "npcs"] as const;

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
  const base = validateAssetBaseUrl(baseUrl);
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
