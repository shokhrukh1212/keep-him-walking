import * as THREE from "three";
import type { ZoneStage } from "../content/schema";
import type { QualityTier } from "../world/types";
import type { VisualGrade } from "../world/visual-grade";

/** Actor-owned materials; source textures/geometries remain owned by the loaded GLB. */
export class CharacterToon {
  readonly gradient = new THREE.DataTexture(new Uint8Array([72, 160, 255]), 3, 1, THREE.RedFormat);
  readonly exposure = { value: 1 };
  readonly tint = { value: new THREE.Vector3(1, 1, 1) };
  readonly materials = new Map<THREE.Material, THREE.MeshToonMaterial>();
  readonly outlines: { source: THREE.Mesh; mesh: THREE.Mesh; materials: THREE.MeshBasicMaterial[] }[] = [];

  constructor() {
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.generateMipmaps = false;
    this.gradient.needsUpdate = true;
  }

  convert(source: THREE.Material): THREE.Material {
    // Eyes retain their original material and the existing depth correction.
    if (!(source instanceof THREE.MeshStandardMaterial) || source.name.includes("high-poly")) return source;
    const cached = this.materials.get(source);
    if (cached) return cached;
    const material = new THREE.MeshToonMaterial({
      name: source.name, color: source.color, map: source.map,
      normalMap: source.normalMap, normalMapType: source.normalMapType, normalScale: source.normalScale,
      bumpMap: source.bumpMap, bumpScale: source.bumpScale,
      displacementMap: source.displacementMap, displacementScale: source.displacementScale,
      displacementBias: source.displacementBias,
      alphaMap: source.alphaMap, alphaTest: source.alphaTest, opacity: source.opacity,
      transparent: source.transparent, depthWrite: source.depthWrite, depthTest: source.depthTest,
      side: source.side, vertexColors: source.vertexColors,
      emissive: source.emissive, emissiveMap: source.emissiveMap, emissiveIntensity: source.emissiveIntensity,
      aoMap: source.aoMap, aoMapIntensity: source.aoMapIntensity,
      lightMap: source.lightMap, lightMapIntensity: source.lightMapIntensity,
      gradientMap: this.gradient,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.worldExposure = this.exposure;
      shader.uniforms.worldTint = this.tint;
      shader.fragmentShader = `uniform float worldExposure;\nuniform vec3 worldTint;\n${shader.fragmentShader}`
        .replace("#include <colorspace_fragment>", "#include <colorspace_fragment>\ngl_FragColor.rgb *= worldExposure * worldTint;");
    };
    material.customProgramCacheKey = () => "character-toon-display-grade-v1";
    this.materials.set(source, material);
    return material;
  }

  addOutline(source: THREE.Mesh) {
    const originals = Array.isArray(source.material) ? source.material : [source.material];
    if (!originals.some((m) => m instanceof THREE.MeshToonMaterial)) return;
    const materials = originals.map((original) => {
      const toon = original instanceof THREE.MeshToonMaterial ? original : null;
      const material = new THREE.MeshBasicMaterial({
        color: 0x2e3a4f, side: THREE.BackSide, transparent: true, opacity: 0.7,
        depthWrite: true, map: toon?.alphaTest ? toon.map : null,
        alphaMap: toon?.alphaMap ?? null, alphaTest: toon?.alphaTest ?? 0,
        visible: Boolean(toon),
      });
      // Sample the map's alpha for hair/lashes, but keep the palette outline colour.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
          "#include <map_fragment>\ndiffuseColor.rgb = diffuse;");
      };
      material.customProgramCacheKey = () => "character-outline-cutout-v1";
      return material;
    });
    const mesh = source.clone(false);
    mesh.name = `${source.name}:outline`;
    mesh.material = Array.isArray(source.material) ? materials : materials[0];
    mesh.scale.copy(source.scale).multiplyScalar(1.018);
    mesh.morphTargetInfluences = source.morphTargetInfluences;
    mesh.frustumCulled = false;
    // Attached skinning normally cancels mesh scale. Use the source's unexpanded
    // inverse so the shared skeleton deforms both passes and the hull stays 1.018x.
    if (mesh instanceof THREE.SkinnedMesh) {
      mesh.updateMatrixWorld = function (force) {
        THREE.SkinnedMesh.prototype.updateMatrixWorld.call(this, force);
        this.bindMatrixInverse.copy(source.matrixWorld).invert();
      };
    }
    source.parent?.add(mesh);
    this.outlines.push({ source, mesh, materials });
  }

  update(stage: ZoneStage, grade: VisualGrade, quality: QualityTier) {
    this.exposure.value = grade.exposure;
    this.tint.value.set(grade.tint.r, grade.tint.g, grade.tint.b);
    for (const { source, mesh, materials } of this.outlines) {
      mesh.visible = quality !== "low" && source.visible;
      mesh.position.copy(source.position);
      mesh.quaternion.copy(source.quaternion);
      mesh.scale.copy(source.scale).multiplyScalar(1.018);
      for (const material of materials) material.color.set(stage.palette[2]);
    }
  }

  dispose() {
    for (const { mesh, materials } of this.outlines) {
      mesh.removeFromParent();
      materials.forEach((material) => material.dispose());
    }
    // Restore originals so the host's GLB disposal releases every source texture,
    // including PBR-only maps not used by toon shading.
    this.materials.forEach((material) => material.dispose());
    this.gradient.dispose();
  }
}

export class CharacterLights extends THREE.Group {
  readonly hemisphere = new THREE.HemisphereLight(0xffffff, 0x2e3a4f, 1.55);
  readonly key = new THREE.DirectionalLight(0xffffff, 0.9);
  readonly fill = new THREE.DirectionalLight(0x2e3a4f, 0.35);
  constructor() {
    super();
    this.fill.position.set(4, 2, 3);
    this.add(this.hemisphere, this.key, this.fill);
  }
  update(stage: ZoneStage) {
    this.hemisphere.color.set(stage.palette[0]);
    this.hemisphere.groundColor.set(stage.palette[2]);
    this.key.color.set(stage.palette[0]);
    this.key.position.set(stage.lightDir === "left" ? -3 : stage.lightDir === "right" ? 3 : 0, 5, 4);
    this.fill.color.set(stage.palette[2]);
    this.fill.position.x = stage.lightDir === "right" ? -4 : 4;
  }
}
