import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTER_MANIFEST, CLIP_DURATIONS, RESIDENT_TYPES } from "./manifest";

type GltfDocument = {
  animations?: { name: string; channels: { target: { node: number } }[]; samplers: { input: number }[] }[];
  accessors: { max?: number[] }[];
  nodes: { name?: string }[];
  skins?: { joints: number[] }[];
  meshes: { extras?: { targetNames?: string[] } }[];
  extensionsRequired?: string[];
};

/** Reads only the JSON chunk: names, joints and clip lengths need no decoding. */
function readGlb(url: string) {
  const file = readFileSync(path.join(process.cwd(), "public", url.split("?")[0]!));
  if (file.readUInt32LE(0) !== 0x46546c67) throw new Error(`${url} is not a GLB`);
  const length = file.readUInt32LE(12);
  return { bytes: file.length, doc: JSON.parse(file.subarray(20, 20 + length).toString("utf8")) as GltfDocument };
}

/** The takes the owner downloaded for each resident on 2026-09-11. */
const RESIDENT_TAKES = ["greet", "idle", "listen", "react", "talk", "walk"];
/** Model plus takes, compressed. The second resident loads only when a walker needs it. */
const RESIDENT_BUDGET_BYTES = 2.5 * 1024 * 1024;

describe.each(RESIDENT_TYPES)("%s assets", (type) => {
  const definition = CHARACTER_MANIFEST.residents[type];
  const model = readGlb(definition.url);
  const motion = readGlb(definition.animationUrl!);

  it("ships a compressed model with a face and no clips of its own", () => {
    expect(model.doc.animations ?? []).toEqual([]);
    expect(model.doc.extensionsRequired).toContain("EXT_meshopt_compression");
    expect(motion.doc.extensionsRequired).toContain("EXT_meshopt_compression");
    expect(model.doc.skins?.[0]?.joints).toHaveLength(52);
    expect(model.doc.meshes.some((mesh) => mesh.extras?.targetNames?.includes("blinkLeft"))).toBe(true);
  });

  it("carries every resident take, bound to the model's own joints", () => {
    const joints = new Set(model.doc.skins![0]!.joints.map((joint) => model.doc.nodes[joint]!.name));
    const clips = new Map((motion.doc.animations ?? []).map((clip) => [clip.name, clip]));
    expect([...clips.keys()].sort()).toEqual(RESIDENT_TAKES);
    for (const clip of clips.values()) {
      for (const channel of clip.channels) expect(joints).toContain(motion.doc.nodes[channel.target.node]!.name);
    }
    const seconds = (name: string) => Math.max(...clips.get(name)!.samplers
      .map((sampler) => motion.doc.accessors[sampler.input]!.max![0]!));
    // The walk is retimed onto the planted-foot grid; every other take keeps its own length.
    expect(seconds("walk")).toBeCloseTo(CLIP_DURATIONS.walk, 3);
    for (const name of RESIDENT_TAKES) expect(seconds(name)).toBeGreaterThan(1);
  });

  it("stays inside its download budget", () => {
    expect(model.bytes + motion.bytes).toBeLessThan(RESIDENT_BUDGET_BYTES);
  });
});
