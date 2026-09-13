import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { METRES_PER_SECOND } from "@/lib/traveler/pace";
import { withMeshoptDecoder } from "./loader";
import { CHARACTER_MANIFEST, RESIDENT_TYPES, type CharacterDefinition } from "./manifest";

type GltfJson = {
  textures?: unknown;
  images?: unknown;
  samplers?: unknown;
  materials?: Array<{ name?: string }>;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  buffers: Array<{ uri?: string }>;
};

/** A shipped GLB with its textures left out; geometry, skin and clips are untouched. */
async function loadWithoutTextures(url: string): Promise<GLTF> {
  const file = readFileSync(`public${url.split("?")[0]}`);
  const jsonLength = file.readUInt32LE(12);
  const document = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8")) as GltfJson;
  delete document.textures;
  delete document.images;
  delete document.samplers;
  if (document.materials) document.materials = document.materials.map((material) => ({ name: material.name }));
  const keep = (extensions?: string[]) => extensions?.filter((name) => name === "EXT_meshopt_compression");
  document.extensionsUsed = keep(document.extensionsUsed);
  if (document.extensionsRequired) document.extensionsRequired = keep(document.extensionsRequired);
  document.buffers[0]!.uri = `data:application/octet-stream;base64,${file.subarray(28 + jsonLength).toString("base64")}`;
  return withMeshoptDecoder(new GLTFLoader()).parseAsync(JSON.stringify(document), "");
}

/**
 * How fast the walk take carries its planted feet, in metres per second of natural
 * playback at the character's manifest height. The widest gap between the two ankles
 * is one step, and the take holds two steps a cycle. The height is calibrated exactly as
 * CharacterActor does it, from the evaluated idle pose.
 */
async function walkTakeMetresPerSecond(definition: CharacterDefinition): Promise<number> {
  const model = await loadWithoutTextures(definition.url);
  const motion = await loadWithoutTextures(definition.animationUrl!);
  const scene = model.scene;
  const mixer = new THREE.AnimationMixer(scene);
  const clip = (name: string) => motion.animations.find((animation) => animation.name.toLowerCase() === name)!;
  const pose = (animation: THREE.AnimationClip, seconds: number) => {
    mixer.stopAllAction();
    const action = mixer.clipAction(animation);
    action.reset().play();
    action.time = seconds;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
    });
  };
  const bone = (name: string) => {
    let found: THREE.Object3D | undefined;
    scene.traverse((object) => {
      if (!found && object.name.replace(/[^a-z0-9]/gi, "").toLowerCase() === name) found = object;
    });
    return found!;
  };

  pose(clip("idle"), 0);
  const bounds = new THREE.Box3().setFromObject(scene);
  const unitsPerMetre = (bounds.max.y - bounds.min.y) / definition.heightMetres;

  const walk = clip("walk");
  const left = bone("mixamorigleftfoot");
  const right = bone("mixamorigrightfoot");
  const samples = 240;
  const gaps = { x: 0, z: 0 };
  const leftRange = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let index = 0; index < samples; index += 1) {
    pose(walk, (index / samples) * walk.duration);
    const l = left.getWorldPosition(new THREE.Vector3());
    const r = right.getWorldPosition(new THREE.Vector3());
    gaps.x = Math.max(gaps.x, Math.abs(l.x - r.x));
    gaps.z = Math.max(gaps.z, Math.abs(l.z - r.z));
    leftRange.minX = Math.min(leftRange.minX, l.x);
    leftRange.maxX = Math.max(leftRange.maxX, l.x);
    leftRange.minZ = Math.min(leftRange.minZ, l.z);
    leftRange.maxZ = Math.max(leftRange.maxZ, l.z);
  }
  // Steps run along whichever horizontal axis the foot sweeps furthest.
  const forward = leftRange.maxZ - leftRange.minZ >= leftRange.maxX - leftRange.minX ? gaps.z : gaps.x;
  mixer.stopAllAction();
  return forward / unitsPerMetre / (walk.duration / 2);
}

describe("walk takes", () => {
  it("move the traveler's planted feet at his walking pace", async () => {
    const measured = await walkTakeMetresPerSecond(CHARACTER_MANIFEST.traveler);
    expect(Math.abs(measured / CHARACTER_MANIFEST.traveler.walkMetresPerSecond! - 1)).toBeLessThan(0.04);
    // At this pace his feet stay on the pavement instead of sliding over it.
    expect(Math.abs(measured / METRES_PER_SECOND - 1)).toBeLessThan(0.04);
  }, 60_000);

  it.each(RESIDENT_TYPES)("record how far the %s walk take carries its feet", async (type) => {
    const definition = CHARACTER_MANIFEST.residents[type];
    const measured = await walkTakeMetresPerSecond(definition);
    expect(Math.abs(measured / definition.walkMetresPerSecond! - 1)).toBeLessThan(0.04);
  }, 60_000);
});
