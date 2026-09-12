import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parisCountryPackV2 } from "@/content/countries/paris.v2";
import { packAssetPaths, verifyAssetPaths } from "../../../scripts/assets/verify";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const assetPath = "/scenes/paris/v2/places/paris-cafe/city-full-360.0123456789.webp";

async function publicDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "khw-verify-"));
  directories.push(directory);
  await mkdir(path.join(directory, path.dirname(assetPath)), { recursive: true });
  await writeFile(path.join(directory, assetPath), "abcd");
  return directory;
}

const options = { base: "https://assets.example.com", origin: "https://keephimwalking.lol" };

describe("asset verification", () => {
  it("lists every rendition of a variable manifest, all content-addressed", () => {
    const paths = packAssetPaths(parisCountryPackV2);
    expect(paths).toHaveLength(5 * 9 + 5);
    expect(paths.every((entry) => /\.[0-9a-f]{10}\.webp$/.test(entry))).toBe(true);
  });

  it("accepts a correctly served rendition", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200, headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "content-length": "4",
    } }));
    await expect(verifyAssetPaths([assetPath], { ...options, publicDirectory: await publicDirectory(), fetcher }))
      .resolves.toEqual([{ path: assetPath, url: `https://assets.example.com${assetPath}`, problems: [] }]);
    expect(fetcher).toHaveBeenCalledWith(`https://assets.example.com${assetPath}`, expect.objectContaining({
      method: "HEAD", headers: { Origin: "https://keephimwalking.lol" }, redirect: "error",
    }));
  });

  it("names every way a CDN can serve a rendition wrongly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200, headers: {
      "content-type": "text/plain",
      "cache-control": "public, max-age=3600",
      "content-length": "9",
    } }));
    const [check] = await verifyAssetPaths([assetPath], { ...options, publicDirectory: await publicDirectory(), fetcher });
    expect(check!.problems).toEqual([
      "content-type text/plain, expected image/webp",
      "cache-control \"public, max-age=3600\" is not a one-year immutable cache",
      "no CORS permission for https://keephimwalking.lol",
      "serves 9 bytes, the checked-in file has 4",
    ]);
    const unreachable = vi.fn<typeof fetch>().mockRejectedValue(new Error("dns"));
    await expect(verifyAssetPaths([assetPath], { ...options, publicDirectory: await publicDirectory(), fetcher: unreachable }))
      .resolves.toMatchObject([{ problems: ["unreachable"] }]);
    await expect(verifyAssetPaths([assetPath], { ...options, base: "", publicDirectory: "public" }))
      .rejects.toThrow("Provide the public asset origin");
  });
});
