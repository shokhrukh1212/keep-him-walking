import * as THREE from "three";
import type { ZoneStage } from "../content/schema";
import type { QualityTier } from "../world/types";
import type { VisualGrade } from "../world/visual-grade";

/**
 * Brows, lashes and teeth are a few pixels wide at live size. A 1.5-pixel hull around
 * them reads as dark smudges over his eyes, so only silhouette-making meshes get one.
 */
const FACE_DETAIL = /eyebrow|eyelash|teeth/i;

/** Actor-owned materials; source textures/geometries remain owned by the loaded GLB. */
export class CharacterToon {
  // Every light adds at least the lowest band everywhere. At 72 the side away from the
  // key fell to 28% and read as dirt on his face and clothes.
  readonly gradient = new THREE.DataTexture(new Uint8Array([128, 199, 255]), 3, 1, THREE.RedFormat);
  readonly exposure = { value: 1 };
  readonly tint = { value: new THREE.Vector3(1, 1, 1) };
  readonly viewport = { value: new THREE.Vector2(1, 1) };
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
    if (originals.some((m) => FACE_DETAIL.test(m.name))) return;
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
        shader.uniforms.outlineViewport = this.viewport;
        shader.vertexShader = `uniform vec2 outlineViewport;\n${shader.vertexShader}`
          .replace("#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )", "#if 1")
          .replace("#include <project_vertex>", `#include <project_vertex>
            // Expand the deformed silhouette by 1.5 CSS pixels, never about the rig origin.
            vec3 hullNormal = transformedNormal;
            #ifdef FLIP_SIDED
              hullNormal = -hullNormal;
            #endif
            vec2 projectedNormal = (projectionMatrix * vec4(hullNormal, 0.0)).xy;
            vec2 pixelNormal = projectedNormal * outlineViewport;
            float normalLength = length(pixelNormal);
            if (normalLength > 0.0001) {
              gl_Position.xy += (pixelNormal / normalLength) * (3.0 / outlineViewport) * gl_Position.w;
            }
          `);
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
          "#include <map_fragment>\ndiffuseColor.rgb = diffuse;");
      };
      material.customProgramCacheKey = () => "character-outline-screen-normal-v2";
      return material;
    });
    const mesh = source.clone(false);
    mesh.name = `${source.name}:outline`;
    mesh.material = Array.isArray(source.material) ? materials : materials[0];
    mesh.scale.copy(source.scale);
    mesh.morphTargetInfluences = source.morphTargetInfluences;
    mesh.frustumCulled = false;
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
      mesh.scale.copy(source.scale);
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

const WHITE = new THREE.Color(1, 1, 1);
/** How much of the zone's hue a light keeps. */
const PALETTE_HINT = 0.15;
/** Light bounced up from the pavement is dimmer than the sky's. */
const GROUND_BOUNCE = 0.55;

/**
 * Pack palettes are the colours that dominate a painting, often sky blue or grey. Lit by
 * those as they are, his skin turned grey and cold, so a light keeps only a hint of the
 * colour's hue, at full brightness.
 */
function hintedLight(target: THREE.Color, hex: string): THREE.Color {
  target.set(hex);
  const peak = Math.max(target.r, target.g, target.b);
  if (peak <= 0) return target.copy(WHITE);
  return target.multiplyScalar(1 / peak).lerp(WHITE, 1 - PALETTE_HINT);
}

export class CharacterLights extends THREE.Group {
  // three divides diffuse light by π. These show a camera-facing face at about 90% of its
  // own colour in daylight, and the side away from the key at about 65%.
  readonly hemisphere = new THREE.HemisphereLight(0xffffff, 0x2e3a4f, 1.1);
  readonly key = new THREE.DirectionalLight(0xffffff, 1.6);
  readonly fill = new THREE.DirectionalLight(0x2e3a4f, 0.4);
  readonly lamp = new THREE.DirectionalLight(0xffd8a0, 0);
  readonly rim = new THREE.DirectionalLight(0xffd8a0, 0);
  constructor() {
    super();
    this.fill.position.set(4, 2, 3);
    this.add(this.hemisphere, this.key, this.fill, this.lamp, this.rim);
  }
  update(stage: ZoneStage, grade?: VisualGrade) {
    hintedLight(this.hemisphere.color, stage.palette[0]);
    hintedLight(this.hemisphere.groundColor, stage.palette[2]).multiplyScalar(GROUND_BOUNCE);
    hintedLight(this.key.color, stage.palette[0]);
    this.key.position.set(stage.lightDir === "left" ? -3 : stage.lightDir === "right" ? 3 : 0, 5, 4);
    hintedLight(this.fill.color, stage.palette[2]);
    this.fill.position.x = stage.lightDir === "right" ? -4 : 4;
    const darkness = THREE.MathUtils.clamp((1 - (grade?.exposure ?? 1)) / 0.38, 0, 1);
    const side = stage.lightDir === "right" ? 1 : -1;
    this.lamp.position.set(side * 2, 3, 4);
    this.rim.position.set(side * 3, 2, -3);
    // The brighter daylight base needs far less help at night.
    this.lamp.intensity = darkness * 0.5;
    this.rim.intensity = darkness;
  }
}
