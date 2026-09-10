import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CharacterActor } from "./actor";
import { CLIP_DURATIONS } from "./manifest";
import { withMeshoptDecoder } from "./loader";

async function shippedTraveler() {
  const file = readFileSync("public/characters/v2/traveler.glb");
  const jsonLength = file.readUInt32LE(12);
  const document = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  // Keep the actual rig and animation buffers; omit texture decoding in this CPU test.
  for (const node of document.nodes) { delete node.mesh; delete node.skin; }
  delete document.meshes; delete document.materials; delete document.textures; delete document.images;
  document.buffers[0].uri = `data:application/octet-stream;base64,${file.subarray(28 + jsonLength).toString("base64")}`;
  // The shipped rig is meshopt-compressed, so this loader needs the same
  // decoder the browser uses or the animation buffers cannot be read.
  const gltf = await withMeshoptDecoder(new GLTFLoader()).parseAsync(JSON.stringify(document), "");
  gltf.scene.add(new THREE.Mesh(new THREE.BoxGeometry(.2, 1.78, .2), new THREE.MeshStandardMaterial()));
  return gltf;
}

it("moves the shipped traveler skeleton across consecutive walk samples", async () => {
  const gltf = await shippedTraveler();
  const actor = new CharacterActor(gltf, 1.78, false);
  const leg = gltf.scene.getObjectByName("mixamorigLeftUpLeg")!;
  expect(leg).toBeDefined();
  actor.sample({ clip: "walk", seconds: .1 }, 1 / 60);
  const first = leg.quaternion.clone();
  actor.sample({ clip: "walk", seconds: .4 }, 1 / 60);
  expect(first.angleTo(leg.quaternion)).toBeGreaterThan(.05);
  actor.dispose();
});

it("freezes on the last frame when fed a running clock, and keeps walking when the phase wraps", async () => {
  const gltf = await shippedTraveler();
  const actor = new CharacterActor(gltf, 1.78, false);
  const leg = gltf.scene.getObjectByName("mixamorigLeftUpLeg")!;

  // sample() clamps a cue to the end of its clip. A caller that passes elapsed
  // journey seconds therefore gets one pose forever — this is what parked the
  // P17 background walkers mid-stride while they slid across the street.
  actor.sample({ clip: "walk", seconds: 100 }, 1 / 60);
  const parked = leg.quaternion.clone();
  actor.sample({ clip: "walk", seconds: 200 }, 1 / 60);
  expect(parked.angleTo(leg.quaternion)).toBe(0);

  // Wrapping the same running clock into the clip's own length animates it.
  // Swept rather than sampled at one pair: a walk cycle is near-mirrored half a
  // period apart, so a single unlucky pair proves nothing either way.
  const walk = CLIP_DURATIONS.walk;
  actor.sample({ clip: "walk", seconds: 100 % walk }, 1 / 60);
  const wrapped = leg.quaternion.clone();
  let widest = 0;
  for (let step = 1; step < 12; step += 1) {
    actor.sample({ clip: "walk", seconds: (100 + step * walk / 12) % walk }, 1 / 60);
    widest = Math.max(widest, wrapped.angleTo(leg.quaternion));
  }
  expect(widest).toBeGreaterThan(.05);
  actor.dispose();
});
