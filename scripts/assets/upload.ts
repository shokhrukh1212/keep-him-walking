import { createHash, createHmac } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ASSET_ROOTS, validateAssetBaseUrl } from "../../src/lib/assets/url";

const MIME: Record<string, string> = {
  ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".wav": "audio/wav",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".md": "text/markdown; charset=utf-8",
};
const MAX_BYTES = 100 * 1024 * 1024;
/** Scene renditions carry a content hash in their name, so their bytes can never change. */
const CONTENT_ADDRESSED = /\.[0-9a-f]{10}\.(?:webp|avif|png|jpe?g)$/;
export type AssetFile = { key: string; file: string; bytes: number; contentType: string };
export type UploadConfig = { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string };
export type UploadArguments = { upload: boolean; prefix: string | null; skipExisting: boolean };

export function uploadConfig(env: Readonly<Record<string, string | undefined>>): UploadConfig {
  const required = ["ASSET_S3_ENDPOINT", "ASSET_S3_BUCKET", "ASSET_S3_ACCESS_KEY_ID", "ASSET_S3_SECRET_ACCESS_KEY"];
  if (required.some((key) => !env[key]?.trim())) throw new Error("Upload requires ASSET_S3_ENDPOINT, ASSET_S3_BUCKET, ASSET_S3_ACCESS_KEY_ID and ASSET_S3_SECRET_ACCESS_KEY");
  const endpoint = validateAssetBaseUrl(env.ASSET_S3_ENDPOINT);
  const bucket = env.ASSET_S3_BUCKET!;
  const region = env.ASSET_S3_REGION || "auto";
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid R2 bucket name");
  if (!/^[a-z0-9-]+$/.test(region) || /[\r\n]/.test(env.ASSET_S3_ACCESS_KEY_ID!)) throw new Error("Invalid upload configuration");
  return { endpoint, bucket, region, accessKeyId: env.ASSET_S3_ACCESS_KEY_ID!, secretAccessKey: env.ASSET_S3_SECRET_ACCESS_KEY! };
}

/** A year for content-addressed renditions; an hour for files that may be repaired in place. */
export function cacheControlFor(key: string): string {
  return CONTENT_ADDRESSED.test(key) ? "public, max-age=31536000, immutable" : "public, max-age=3600";
}

export function parseUploadArguments(args: readonly string[]): UploadArguments {
  const usage = "Usage: pnpm assets:upload [--dry-run | --upload] [--prefix scenes/<city>/<version>] [--skip-existing]";
  let upload = false;
  let dryRun = false;
  let skipExisting = false;
  let prefix: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--upload") upload = true;
    else if (argument === "--dry-run") dryRun = true;
    else if (argument === "--skip-existing") skipExisting = true;
    else if (argument === "--prefix" && args[index + 1]) prefix = args[++index]!.replace(/^\/+|\/+$/g, "");
    else throw new Error(usage);
  }
  if (upload && dryRun) throw new Error(usage);
  if (prefix !== null && (
    !ASSET_ROOTS.some((root) => prefix === root || prefix!.startsWith(`${root}/`))
    || prefix.split("/").some((part) => !part || part === "." || part === "..")
  )) {
    throw new Error("Upload prefix must be inside a public asset tree");
  }
  return { upload, prefix, skipExisting };
}

/** Collect only runtime assets already intended for public delivery. Never follow symlinks. */
export async function collectAssets(publicDirectory: string): Promise<AssetFile[]> {
  const files: AssetFile[] = [];
  const visit = async (key: string) => {
    const file = path.join(publicDirectory, key);
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw new Error(`Symlink in asset tree: ${key}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort()) {
        if (!name.startsWith(".")) await visit(`${key}/${name}`);
      }
    } else if (info.isFile()) {
      const contentType = MIME[path.extname(key).toLowerCase()];
      if (!contentType) return; // Authoring files are not runtime assets.
      if (info.size > MAX_BYTES) throw new Error(`Asset exceeds the 100 MiB single-upload limit: ${key}`);
      files.push({ key, file, bytes: info.size, contentType });
    }
  };
  for (const root of ASSET_ROOTS) {
    try { await lstat(path.join(publicDirectory, root)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    await visit(root);
  }
  return files;
}

/** AWS Signature V4, S3 path-style PUT; uses a real payload hash, never streaming signing. */
export function signAssetPut(config: UploadConfig, key: string, body: Uint8Array, contentType: string, now: Date) {
  if (!ASSET_ROOTS.some((root) => key.startsWith(`${root}/`)) || key.split("/").some((part) => !part || part === "." || part === "..") || /[\\\r\n]/.test(key)) {
    throw new Error("Invalid public asset key");
  }
  const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const uri = `/${encode(config.bucket)}/${key.split("/").map(encode).join("/")}`;
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = date.slice(0, 8);
  const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
  const hmac = (secret: string | Uint8Array, value: string) => createHmac("sha256", secret).update(value).digest();
  const headers: Record<string, string> = {
    "cache-control": cacheControlFor(key),
    "content-type": contentType,
    host: new URL(config.endpoint).host,
    "x-amz-content-sha256": hash(body),
    "x-amz-date": date,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const canonical = ["PUT", uri, "", canonicalHeaders, signedHeaders, hash(body)].join("\n");
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, day), config.region), "s3"), "aws4_request");
  const signature = hmac(signingKey, ["AWS4-HMAC-SHA256", date, scope, hash(canonical)].join("\n")).toString("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `${config.endpoint}${uri}`, headers };
}

export async function runAssetUpload(args: string[], env: Readonly<Record<string, string | undefined>>, publicDirectory: string, fetcher: typeof fetch = fetch) {
  const options = parseUploadArguments(args);
  // Validate everything before the first network write. Dry run needs no credentials.
  const config = options.upload ? uploadConfig(env) : undefined;
  const publicBase = options.skipExisting ? validateAssetBaseUrl(env.ASSET_BASE_URL) : "";
  if (options.skipExisting && !publicBase) throw new Error("--skip-existing reads the public asset origin; set ASSET_BASE_URL");
  const files = (await collectAssets(publicDirectory))
    .filter((asset) => !options.prefix || asset.key === options.prefix || asset.key.startsWith(`${options.prefix}/`));
  if (!files.length) throw new Error("No public runtime assets found");
  let uploaded = 0;
  let skipped = 0;
  if (config) for (const asset of files) {
    const info = await lstat(asset.file);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== asset.bytes) throw new Error(`Asset changed after preflight: ${asset.key}`);
    if (publicBase) {
      const existing = await fetcher(`${publicBase}/${asset.key}`, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(10_000) })
        .catch(() => null);
      if (existing?.ok && Number(existing.headers.get("content-length")) === asset.bytes) {
        skipped++;
        continue;
      }
    }
    const body = await readFile(asset.file);
    const request = signAssetPut(config, asset.key, body, asset.contentType, new Date());
    let response: Response;
    try {
      response = await fetcher(request.url, { method: "PUT", headers: request.headers, body, redirect: "error", signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new Error(`Upload failed for ${asset.key} after ${uploaded} uploads; check network/configuration and rerun`);
    }
    if (!response.ok) throw new Error(`Upload failed for ${asset.key} (HTTP ${response.status}) after ${uploaded} uploads; check credentials and rerun`);
    await response.body?.cancel();
    uploaded++;
  }
  return {
    mode: options.upload ? "upload" : "dry-run",
    files: files.length,
    bytes: files.reduce((sum, asset) => sum + asset.bytes, 0),
    uploaded,
    skipped,
    prefix: options.prefix,
    roots: ASSET_ROOTS,
  };
}
