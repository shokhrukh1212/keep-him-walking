import { access, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { REQUIRED_TRAVELER_ACTIONS, validateSpriteManifest } from "./rig-contract";

const manifest = tashkentCountryPackV4.traveler.spriteManifest!;

describe("production sprite manifest", () => {
  it("contains every state and every referenced frame", async () => {
    expect(validateSpriteManifest(tashkentCountryPackV4)).toEqual([]);
    for (const state of REQUIRED_TRAVELER_ACTIONS) {
      for (const frame of manifest.clips[state]!.frames) {
        await expect(access(path.join(process.cwd(), "public", frame))).resolves.toBeUndefined();
      }
    }
  });

  it("keeps planted feet on the ground without metadata sliding", () => {
    const walk = manifest.clips.walk!;
    for (const foot of ["leftFoot", "rightFoot"] as const) {
      const planted = walk.metadata.filter((frame) => frame[foot].planted).map((frame) => frame[foot]);
      expect(planted.length).toBeGreaterThan(1);
      expect(planted.every((point) => point.y === manifest.canvas.groundY)).toBe(true);
      expect(Math.max(...planted.map((point) => point.x)) - Math.min(...planted.map((point) => point.x))).toBeLessThanOrEqual(0.08);
    }
  });

  it("provides sponsor transforms inside the mobile transfer budget", async () => {
    const urls = new Set(Object.values(manifest.clips).flatMap((clip) => clip?.frames ?? []));
    let transfer = 0;
    for (const url of urls) transfer += (await stat(path.join(process.cwd(), "public", url))).size;
    expect(transfer).toBeLessThanOrEqual(1.6 * 1_048_576);
    expect(Object.values(manifest.clips).every((clip) => clip?.metadata.every((frame) => frame.sponsorAnchor.scale > 0))).toBe(true);
  });
});
