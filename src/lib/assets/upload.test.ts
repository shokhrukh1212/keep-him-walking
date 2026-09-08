import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectAssets, runAssetUpload, signAssetPut, uploadConfig } from "../../../scripts/assets/upload";

const directories: string[] = [];
const env = {
  ASSET_S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  ASSET_S3_BUCKET: "walking-assets", ASSET_S3_ACCESS_KEY_ID: "test-access-id",
  ASSET_S3_SECRET_ACCESS_KEY: "test-secret-never-print",
};
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "khw-assets-test-"));
  directories.push(directory);
  await mkdir(path.join(directory, "scenes"));
  await writeFile(path.join(directory, "scenes", "image.webp"), "abc");
  return directory;
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("asset upload", () => {
  it("requires private credentials only for real uploads", () => {
    expect(() => uploadConfig({})).toThrow("Upload requires");
    expect(uploadConfig(env)).toMatchObject({ region: "auto", bucket: "walking-assets" });
    expect(() => uploadConfig({ ...env, ASSET_S3_BUCKET: "../private" })).toThrow("bucket name");
    expect(() => uploadConfig({ ...env, ASSET_S3_ENDPOINT: "http://insecure.example.com" })).toThrow("HTTPS");
  });
  it("collects runtime files and credits but excludes secrets, source models and unrelated public paths", async () => {
    const directory = await fixture();
    await writeFile(path.join(directory, "scenes", ".env"), "secret");
    await writeFile(path.join(directory, "scenes", "source.blend"), "authoring");
    await writeFile(path.join(directory, "private.webp"), "not in scope");
    await mkdir(path.join(directory, "characters"));
    await writeFile(path.join(directory, "characters", "CREDITS.md"), "credits");
    const assets = await collectAssets(directory);
    expect(assets.map((asset) => asset.key)).toEqual(["characters/CREDITS.md", "scenes/image.webp"]);
    expect(assets[1]).toMatchObject({ bytes: 3, contentType: "image/webp" });
  });
  it("refuses a symlink before making any upload requests", async () => {
    const directory = await fixture();
    await symlink(path.join(directory, "scenes", "image.webp"), path.join(directory, "scenes", "alias.webp"));
    const request = vi.fn<typeof fetch>();
    await expect(runAssetUpload(["--upload"], env, directory, request)).rejects.toThrow("Symlink");
    expect(request).not.toHaveBeenCalled();
  });
  it("defaults to a credential-free, network-free dry run", async () => {
    const request = vi.fn<typeof fetch>();
    const directory = await fixture();
    await expect(runAssetUpload([], {}, directory, request)).resolves.toMatchObject({ mode: "dry-run", files: 1, bytes: 3, uploaded: 0 });
    expect(request).not.toHaveBeenCalled();
    await expect(runAssetUpload(["--delete"], env, directory, request)).rejects.toThrow("Usage");
    await expect(runAssetUpload(["--upload", "--dry-run"], env, directory, request)).rejects.toThrow("Usage");
  });
  it("signs the exact encoded S3 key and payload, binding metadata to the signature", () => {
    const config = uploadConfig(env);
    const now = new Date("2026-09-08T12:00:00Z");
    const body = Buffer.from("abc");
    const signed = signAssetPut(config, "scenes/a !'().webp", body, "image/webp", now);
    expect(signed.url).toBe("https://account.r2.cloudflarestorage.com/walking-assets/scenes/a%20%21%27%28%29.webp");
    expect(signed.headers["x-amz-content-sha256"]).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(signed.headers["x-amz-date"]).toBe("20260908T120000Z");
    expect(signed.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access-id\/20260908\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/);
    expect(signed.headers.authorization).not.toContain(env.ASSET_S3_SECRET_ACCESS_KEY);
    expect(signAssetPut(config, "scenes/a !'().webp", body, "image/webp", now)).toEqual(signed);
    expect(signAssetPut(config, "scenes/a !'().webp", Buffer.from("abd"), "image/webp", now).headers.authorization).not.toBe(signed.headers.authorization);
    expect(() => signAssetPut(config, "scenes/../private.env", body, "text/plain", now)).toThrow("Invalid public asset key");
  });
  it("uploads the bytes to the matching key with MIME, bounded cache and redirect protection", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(runAssetUpload(["--upload"], env, await fixture(), request)).resolves.toMatchObject({ uploaded: 1 });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(`${env.ASSET_S3_ENDPOINT}/walking-assets/scenes/image.webp`);
    expect(options).toMatchObject({ method: "PUT", redirect: "error", body: Buffer.from("abc"), headers: { "content-type": "image/webp", "cache-control": "public, max-age=3600" } });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it("stops on HTTP failure without exposing remote response bodies or credentials", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("remote secret details", { status: 403 }));
    await expect(runAssetUpload(["--upload"], env, await fixture(), request)).rejects.toThrow("Upload failed for scenes/image.webp (HTTP 403) after 0 uploads; check credentials and rerun");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("sanitizes network errors that could contain signed request details", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(env.ASSET_S3_SECRET_ACCESS_KEY));
    await expect(runAssetUpload(["--upload"], env, await fixture(), request)).rejects.toThrow("Upload failed for scenes/image.webp after 0 uploads; check network/configuration and rerun");
  });
});
