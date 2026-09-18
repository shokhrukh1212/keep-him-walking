import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { CharacterActor } from "./actor";
import { withMeshoptDecoder } from "./loader";
import { CHARACTER_MANIFEST } from "./manifest";
import { propWindow } from "./props";

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

async function shippedTraveler(withTakes: boolean): Promise<GLTF> {
  const definition = CHARACTER_MANIFEST.traveler;
  const mesh = await loadWithoutTextures(withTakes ? definition.url : definition.fallbackUrl!);
  if (!withTakes) return mesh;
  const takes = await loadWithoutTextures(definition.animationUrl!);
  return { ...mesh, animations: [...mesh.animations, ...takes.animations] };
}

const named = (scene: THREE.Object3D, bone: string) => {
  let found: THREE.Object3D | undefined;
  scene.traverse((object) => {
    if (!found && object.name.replace(/[^a-z0-9]/gi, "") === bone) found = object;
  });
  return found!;
};

/**
 * How near the bottle's open neck comes to a tooth, skinned exactly as the renderer
 * skins it. Measured from the mesh rather than from the actor, so this says the bottle
 * reaches his mouth rather than that the code agrees with itself.
 */
function neckToMouth(scene: THREE.Object3D, bottle: THREE.Object3D): number {
  let teeth: THREE.SkinnedMesh | undefined;
  scene.traverse((object) => {
    if (!teeth && object instanceof THREE.SkinnedMesh && /teeth/i.test(object.name)) teeth = object;
  });
  const neck = bottle.getObjectByName("Bottle neck")!;
  const tip = neck.getWorldPosition(new THREE.Vector3())
    .add(new THREE.Vector3(0, .014, 0)
      .applyQuaternion(neck.getWorldQuaternion(new THREE.Quaternion()))
      .multiplyScalar(bottle.getWorldScale(new THREE.Vector3()).x));
  const vertices = teeth!.geometry.attributes.position as THREE.BufferAttribute;
  const point = new THREE.Vector3();
  let nearest = Infinity;
  for (let index = 0; index < vertices.count; index += 9) {
    teeth!.applyBoneTransform(index, point.fromBufferAttribute(vertices, index));
    nearest = Math.min(nearest, teeth!.localToWorld(point).distanceTo(tip));
  }
  return nearest;
}

describe("the bottle he drinks from", () => {
  const window = propWindow("drink")!;

  it("is carried by the hand the installed take raises, and its neck meets his lips", async () => {
    const gltf = await shippedTraveler(true);
    const actor = new CharacterActor(gltf, CHARACTER_MANIFEST.traveler.heightMetres, true);
    const scene = gltf.scene;
    const bottle = scene.getObjectByName("Bottle body")!.parent!;
    // The V3 Mixamo take drinks left-handed. Until 2026-09-18 the bottle was nailed to
    // the right hand by a grip cut from the V2 pose, so it hung at his side untouched
    // while he mimed the drink — a premium sponsor's label with it.
    expect(bottle.parent?.name.replace(/[^a-z0-9]/gi, "")).toBe("mixamorigLeftHand");

    const palm = named(scene, "mixamorigLeftHandMiddle1");
    const travelled = new THREE.Box3();
    let furthestFromMouth = 0;
    let furthestFromPalm = 0;
    for (let seconds = window.contact; seconds <= window.release; seconds += .1) {
      actor.sample({ clip: "drink", seconds }, 1 / 60, true);
      scene.updateMatrixWorld(true);
      expect(bottle.visible).toBe(true);
      const middle = bottle.getWorldPosition(new THREE.Vector3());
      travelled.expandByPoint(middle);
      furthestFromMouth = Math.max(furthestFromMouth, neckToMouth(scene, bottle));
      furthestFromPalm = Math.max(furthestFromPalm, middle.distanceTo(palm.getWorldPosition(new THREE.Vector3())));
    }
    // At his lips for the whole drink, and never out of his fist while it is there.
    expect(furthestFromMouth).toBeLessThan(.02);
    expect(furthestFromPalm).toBeLessThan(.07);
    // And it travels with him: the frozen bottle of the old placement moved by nothing.
    expect(travelled.getSize(new THREE.Vector3()).length()).toBeGreaterThan(.1);
    actor.dispose();
  }, 60_000);

  it("stays in the right hand of the fallback model, whose own take drinks right-handed", async () => {
    const gltf = await shippedTraveler(false);
    const actor = new CharacterActor(gltf, CHARACTER_MANIFEST.traveler.heightMetres, true);
    const bottle = gltf.scene.getObjectByName("Bottle body")!.parent!;
    expect(bottle.parent?.name.replace(/[^a-z0-9]/gi, "")).toBe("mixamorigRightHand");
    actor.dispose();
  }, 60_000);
});
