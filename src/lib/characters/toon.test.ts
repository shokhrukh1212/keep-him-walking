import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { CharacterActor } from "./actor";
import { CharacterLights, CharacterToon } from "./toon";
import { CLIP_DURATIONS } from "./manifest";
import { stageSchema } from "../content/schema";

const stage = stageSchema.parse({ palette: ["#ffe2b0", "#887766", "#223344"] });
const grade = { exposure: 1.2, tint: { r: 1, g: 0.9, b: 0.8 } };

describe("toon material ownership", () => {
  it("keeps source colour, texture/normal/alpha inputs and uses three unfiltered bands", () => {
    const appearance = new CharacterToon();
    const source = new THREE.MeshStandardMaterial({ color: "#337788", map: new THREE.Texture(),
      normalMap: new THREE.Texture(), alphaMap: new THREE.Texture(), alphaTest: 0.4,
      side: THREE.DoubleSide, depthWrite: true });
    source.normalScale.set(0.3, 0.5);
    const toon = appearance.convert(source) as THREE.MeshToonMaterial;
    expect(toon).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(toon.color.equals(source.color)).toBe(true);
    expect(toon.map).toBe(source.map);
    expect(toon.normalMap).toBe(source.normalMap);
    expect(toon.normalScale.equals(source.normalScale)).toBe(true);
    expect(toon.alphaMap).toBe(source.alphaMap);
    expect(toon.alphaTest).toBe(0.4);
    expect(toon.depthWrite).toBe(true);
    expect(toon.side).toBe(THREE.DoubleSide);
    expect(appearance.gradient.image.width).toBe(3);
    expect([...appearance.gradient.image.data]).toEqual([72, 160, 255]);
    expect(appearance.gradient.minFilter).toBe(THREE.NearestFilter);
    expect(appearance.gradient.magFilter).toBe(THREE.NearestFilter);
    expect(appearance.gradient.generateMipmaps).toBe(false);
    expect(appearance.convert(source)).toBe(toon);
    source.name = "traveler-body.high-poly";
    expect(appearance.convert(source)).toBe(source);
    appearance.dispose();
  });

  it("updates live uniforms after sRGB encoding, matching Pixi display-space grading", () => {
    const appearance = new CharacterToon();
    const toon = appearance.convert(new THREE.MeshStandardMaterial());
    const shader = { uniforms: {}, vertexShader: "", fragmentShader: THREE.ShaderLib.toon.fragmentShader } as unknown as Parameters<THREE.Material["onBeforeCompile"]>[0];
    toon.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    appearance.update(stage, grade, "high");
    expect(shader.uniforms).toMatchObject({ worldExposure: { value: 1.2 } });
    expect(appearance.tint.value.toArray()).toEqual([1, 0.9, 0.8]);
    expect(shader.fragmentShader).toContain("#include <colorspace_fragment>\ngl_FragColor.rgb *= worldExposure * worldTint;");
    appearance.dispose();
  });

  it("keeps skinned and morphed hulls aligned even when the actor root is transformed", () => {
    const appearance = new CharacterToon();
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([1, 1, 0], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([1.2, 1, 0], 3)];
    const source = new THREE.SkinnedMesh(geometry, appearance.convert(new THREE.MeshStandardMaterial()));
    const bone = new THREE.Bone();
    source.add(bone); root.add(source); root.updateMatrixWorld(true);
    source.bind(new THREE.Skeleton([bone]));
    appearance.addOutline(source);
    const outline = appearance.outlines[0].mesh as THREE.SkinnedMesh;
    expect(outline.skeleton).toBe(source.skeleton);
    expect(outline.morphTargetInfluences).toBe(source.morphTargetInfluences);
    expect(outline.geometry).toBe(source.geometry);
    root.position.set(3, 0.2, 1); root.scale.setScalar(0.8); root.rotation.y = 0.6;
    bone.rotation.z = 0.4; source.morphTargetInfluences![0] = 0.6;
    appearance.update(stage, grade, "high"); root.updateMatrixWorld(true); source.skeleton.update();
    const original = source.getVertexPosition(0, new THREE.Vector3()).applyMatrix4(source.matrixWorld);
    const expanded = outline.getVertexPosition(0, new THREE.Vector3()).applyMatrix4(outline.matrixWorld);
    expect(expanded.distanceTo(original)).toBeLessThan(1e-6);
    const material = appearance.outlines[0].materials[0];
    expect(material.side).toBe(THREE.BackSide);
    expect(material.opacity).toBe(0.7);
    expect(material.depthWrite).toBe(true);
    expect(material.color.getHexString()).toBe("223344");
    appearance.update(stage, grade, "low"); expect(outline.visible).toBe(false);
    appearance.update(stage, grade, "medium"); expect(outline.visible).toBe(true);
    const disposed = vi.fn(); material.addEventListener("dispose", disposed);
    appearance.dispose(); expect(disposed).toHaveBeenCalledOnce(); expect(outline.parent).toBeNull();
  });

  it("expands outlines in screen pixels after skinning without scaling the rig", () => {
    const appearance = new CharacterToon();
    const source = new THREE.Mesh(new THREE.BoxGeometry(), appearance.convert(new THREE.MeshStandardMaterial()));
    appearance.addOutline(source);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader } as unknown as Parameters<THREE.Material["onBeforeCompile"]>[0];
    appearance.outlines[0].materials[0].onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.outlineViewport).toBe(appearance.viewport);
    expect(shader.vertexShader.indexOf("pixelNormal / normalLength")).toBeGreaterThan(shader.vertexShader.indexOf("#include <skinning_vertex>"));
    expect(appearance.outlines[0].mesh.scale.toArray()).toEqual(source.scale.toArray());
    appearance.dispose();
  });

  it("preserves actor hair/lash cutouts, eye depth, sponsor patch and original resources on disposal", async () => {
    const scene = new THREE.Group();
    for (const name of ["body", "eyelashes01", "elvs_grump_hair", "high-poly", "SponsorPatch"]) {
      const material = new THREE.MeshStandardMaterial({ name, transparent: name !== "SponsorPatch", map: new THREE.Texture() });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.1), material);
      mesh.name = name; scene.add(mesh);
    }
    const sources = scene.children.map((mesh) => (mesh as THREE.Mesh).material);
    const gltf = { scene, animations: Object.entries(CLIP_DURATIONS).map(([name, duration]) => new THREE.AnimationClip(name, duration, [])) } as unknown as GLTF;
    const actor = new CharacterActor(gltf, 1.78, false);
    for (const name of ["eyelashes01", "elvs_grump_hair"]) {
      const material = (scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshToonMaterial;
      expect(material).toBeInstanceOf(THREE.MeshToonMaterial);
      expect(material.transparent).toBe(false); expect(material.alphaTest).toBe(0.4); expect(material.depthWrite).toBe(true);
      const hull = actor.toon.outlines.find((item) => item.source.name === name)!;
      expect(hull.materials[0].map).toBe(material.map);
    }
    const eye = (scene.getObjectByName("high-poly") as THREE.Mesh).material;
    expect(eye).toBe(sources[3]); expect((eye as THREE.Material).depthWrite).toBe(false);
    const patch = (scene.getObjectByName("SponsorPatch") as THREE.Mesh).material as THREE.MeshToonMaterial;
    expect(patch).toBeInstanceOf(THREE.MeshToonMaterial);
    const logo = new THREE.Texture();
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(logo);
    const disposedLogo = vi.fn(); logo.addEventListener("dispose", disposedLogo);
    await actor.setSponsor("https://example.test/logo.png");
    expect(patch.map).toBe(logo); expect(logo.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(logo.flipY).toBe(false); expect(patch.color.getHexString()).toBe("ffffff");
    await actor.setSponsor(undefined);
    expect(patch.map).toBeNull(); expect(disposedLogo).toHaveBeenCalledOnce();
    load.mockRestore();
    actor.dispose();
    expect(scene.children.slice(0, 5).map((mesh) => (mesh as THREE.Mesh).material)).toEqual(sources);
    expect(scene.children.some((mesh) => mesh.name.endsWith(":outline"))).toBe(false);
  });
});

it("uses the zone palette and named light side without shadow maps", () => {
  const lights = new CharacterLights();
  for (const [lightDir, x] of [["left", -3], ["right", 3], ["top", 0]] as const) {
    lights.update({ ...stage, lightDir });
    expect(lights.key.position.x).toBe(x);
    expect(lights.key.color.getHexString()).toBe("ffe2b0");
    expect(lights.hemisphere.groundColor.getHexString()).toBe("223344");
    expect(lights.fill.intensity).toBe(0.35);
    expect(lights.key.intensity).toBe(0.9);
    expect(lights.key.castShadow).toBe(false);
  }
});

it("adds warm face and rim lighting in dark scenes while retaining the shared grade", () => {
  const lights = new CharacterLights();
  lights.update(stage, { exposure: 1, tint: { r: 1, g: 1, b: 1 } });
  expect(lights.lamp.intensity).toBe(0);
  lights.update(stage, { exposure: 0.62, tint: { r: 0.72, g: 0.8, b: 1 } });
  expect(lights.lamp.intensity).toBeCloseTo(2.2);
  expect(lights.rim.intensity).toBeCloseTo(2.8);
  expect(lights.lamp.position.z).toBeGreaterThan(0);
  expect(lights.rim.position.z).toBeLessThan(0);
});
