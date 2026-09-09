import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CharacterActor } from "./actor";

it("moves the shipped traveler skeleton across consecutive walk samples", async () => {
  const file = readFileSync("public/characters/v2/traveler.glb");
  const jsonLength = file.readUInt32LE(12);
  const document = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  // Keep the actual rig and animation buffers; omit texture decoding in this CPU test.
  for (const node of document.nodes) { delete node.mesh; delete node.skin; }
  delete document.meshes; delete document.materials; delete document.textures; delete document.images;
  document.buffers[0].uri = `data:application/octet-stream;base64,${file.subarray(28 + jsonLength).toString("base64")}`;
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(document), "");
  gltf.scene.add(new THREE.Mesh(new THREE.BoxGeometry(.2, 1.78, .2), new THREE.MeshStandardMaterial()));
  const actor = new CharacterActor(gltf, 1.78, false);
  const leg = gltf.scene.getObjectByName("mixamorigLeftUpLeg")!;
  expect(leg).toBeDefined();
  actor.sample({ clip: "walk", seconds: .1 }, 1 / 60);
  const first = leg.quaternion.clone();
  actor.sample({ clip: "walk", seconds: .4 }, 1 / 60);
  expect(first.angleTo(leg.quaternion)).toBeGreaterThan(.05);
  actor.dispose();
});
