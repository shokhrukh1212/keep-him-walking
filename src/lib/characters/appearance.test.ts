import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { CharacterActor } from "./actor";
import { CharacterAppearance, CharacterLights } from "./appearance";
import { CLIP_DURATIONS } from "./manifest";
import { stageSchema } from "../content/schema";

const stage = stageSchema.parse({ palette: ["#ffe2b0", "#887766", "#223344"] });
const grade = { exposure: 1.2, tint: { r: 1, g: 0.9, b: 0.8 } };

describe("character material ownership", () => {
  it("copies each standard material with its own smooth shading, maps and cutouts", () => {
    const appearance = new CharacterAppearance();
    const source = new THREE.MeshStandardMaterial({ color: "#337788", map: new THREE.Texture(),
      normalMap: new THREE.Texture(), alphaMap: new THREE.Texture(), alphaTest: 0.4,
      side: THREE.DoubleSide, depthWrite: true, roughness: 0.86 });
    source.normalScale.set(0.3, 0.5);
    const copy = appearance.convert(source) as THREE.MeshStandardMaterial;
    expect(copy).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(copy).not.toBe(source);
    expect(copy.color.equals(source.color)).toBe(true);
    expect(copy.map).toBe(source.map);
    expect(copy.normalMap).toBe(source.normalMap);
    expect(copy.normalScale.equals(source.normalScale)).toBe(true);
    expect(copy.alphaMap).toBe(source.alphaMap);
    expect(copy.alphaTest).toBe(0.4);
    expect(copy.depthWrite).toBe(true);
    expect(copy.side).toBe(THREE.DoubleSide);
    expect(copy.roughness).toBe(0.86);
    expect(appearance.convert(source)).toBe(copy);
    const basic = new THREE.MeshBasicMaterial();
    expect(appearance.convert(basic)).toBe(basic);
    appearance.dispose();
  });

  it("grades the eyes too, keeping their blending without depth writes", () => {
    const appearance = new CharacterAppearance();
    const eye = new THREE.MeshStandardMaterial({ name: "traveler-body.high-poly", transparent: true, depthWrite: false });
    const copy = appearance.convert(eye) as THREE.MeshStandardMaterial;
    expect(copy).not.toBe(eye);
    expect(copy.transparent).toBe(true);
    expect(copy.depthWrite).toBe(false);
    expect(appearance.materials.get(eye)).toBe(copy);
    appearance.dispose();
  });

  it("updates live uniforms after sRGB encoding, matching Pixi display-space grading", () => {
    const appearance = new CharacterAppearance();
    const material = appearance.convert(new THREE.MeshStandardMaterial());
    const shader = { uniforms: {}, vertexShader: "", fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as Parameters<THREE.Material["onBeforeCompile"]>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    appearance.update(grade);
    expect(shader.uniforms).toMatchObject({ worldExposure: { value: 1.2 } });
    expect(appearance.tint.value.toArray()).toEqual([1, 0.9, 0.8]);
    expect(shader.fragmentShader).toContain("#include <colorspace_fragment>\ngl_FragColor.rgb *= worldExposure * worldTint;");
    appearance.dispose();
  });

  it("gives an actor graded cutouts, eyes and sponsor patch, no outline meshes, and its originals back on disposal", async () => {
    const scene = new THREE.Group();
    for (const name of ["body", "eyelashes01", "elvs_grump_hair", "high-poly", "SponsorPatch"]) {
      const material = new THREE.MeshStandardMaterial({ name, transparent: name !== "SponsorPatch", map: new THREE.Texture() });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.1), material);
      mesh.name = name; scene.add(mesh);
    }
    const sources = scene.children.map((mesh) => (mesh as THREE.Mesh).material);
    const gltf = { scene, animations: Object.entries(CLIP_DURATIONS).map(([name, duration]) => new THREE.AnimationClip(name, duration, [])) } as unknown as GLTF;
    const actor = new CharacterActor(gltf, 1.78, false);
    const material = (name: string) => (scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(actor.appearance.materials.size).toBe(5);
    for (const name of ["eyelashes01", "elvs_grump_hair"]) {
      expect(material(name).transparent).toBe(false); expect(material(name).alphaTest).toBe(0.4); expect(material(name).depthWrite).toBe(true);
    }
    expect(material("high-poly")).not.toBe(sources[3]); expect(material("high-poly").depthWrite).toBe(false);
    const names: string[] = [];
    scene.traverse((object) => names.push(object.name));
    expect(names.filter((name) => name.endsWith(":outline"))).toEqual([]);
    const patch = material("SponsorPatch");
    expect(patch).not.toBe(sources[4]);
    const logo = new THREE.Texture();
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(logo);
    const disposedLogo = vi.fn(); logo.addEventListener("dispose", disposedLogo);
    await actor.setSponsor("https://example.test/logo.png");
    expect(patch.map).toBe(logo); expect(logo.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(logo.flipY).toBe(false); expect(patch.color.getHexString()).toBe("ffffff");
    await actor.setSponsor(undefined);
    expect(patch.map).toBeNull(); expect(disposedLogo).toHaveBeenCalledOnce();
    load.mockRestore();
    const disposedCopy = vi.fn(); patch.addEventListener("dispose", disposedCopy);
    actor.dispose();
    expect(scene.children.slice(0, 5).map((mesh) => (mesh as THREE.Mesh).material)).toEqual(sources);
    expect(disposedCopy).toHaveBeenCalledOnce();
  });
});

it("takes the named light side and a hint of the zone palette without shadow maps", () => {
  const lights = new CharacterLights();
  for (const [lightDir, x] of [["left", -3], ["right", 3], ["top", 0]] as const) {
    lights.update({ ...stage, lightDir });
    expect(lights.key.position.x).toBe(x);
    const key = lights.key.color;
    expect(Math.max(key.r, key.g, key.b)).toBeCloseTo(1);
    expect(key.r).toBeGreaterThan(key.b);
    expect(lights.hemisphere.groundColor.r).toBeLessThan(lights.hemisphere.color.r);
    expect(lights.fill.intensity).toBe(0.45);
    expect(lights.key.intensity).toBe(1.8);
    expect(lights.key.castShadow).toBe(false);
  }
});

/** three's diffuse light on a matte surface facing `normal`: hemisphere mix plus each directional light by its cosine, over π. */
function diffuseLight(lights: CharacterLights, normal: THREE.Vector3) {
  const total = new THREE.Color().lerpColors(lights.hemisphere.groundColor, lights.hemisphere.color, 0.5 * normal.y + 0.5)
    .multiplyScalar(lights.hemisphere.intensity);
  for (const light of [lights.key, lights.fill]) {
    const cosine = Math.max(0, normal.dot(light.position.clone().normalize()));
    total.add(light.color.clone().multiplyScalar(light.intensity * cosine));
  }
  const { r, g, b } = total.multiplyScalar(1 / Math.PI);
  return [r, g, b];
}

it("lights him like a person outdoors, never brighter than his own colours, under any zone palette", () => {
  const lights = new CharacterLights();
  // Paris arrival and lanes as the pack builder estimated them, then the authoring default.
  for (const palette of [["#aaccee", "#aa9988", "#777777"], ["#888888", "#ccaa99", "#aaccee"], ["#b9a27a", "#6f7a5a", "#2e3a4f"]]) {
    lights.update(stageSchema.parse({ palette }));
    const face = diffuseLight(lights, new THREE.Vector3(0, 0, 1));
    const awayFromKey = diffuseLight(lights, new THREE.Vector3(1, 0, 0));
    const crown = diffuseLight(lights, new THREE.Vector3(0, 1, 0));
    expect(Math.min(...face)).toBeGreaterThan(0.65);
    expect(Math.max(...face)).toBeLessThan(0.85);
    expect(Math.max(...face) / Math.min(...face)).toBeLessThan(1.15);
    expect(Math.min(...awayFromKey)).toBeGreaterThan(0.35);
    expect(Math.max(...awayFromKey)).toBeLessThan(0.6);
    expect(Math.max(...crown)).toBeLessThan(1);
  }
});

it("adds no light of its own at night, leaving the shared grade to dim him with the painting", () => {
  const lights = new CharacterLights();
  lights.update(stage);
  expect(lights.children.map((child) => child.type)).toEqual(["HemisphereLight", "DirectionalLight", "DirectionalLight"]);
});
