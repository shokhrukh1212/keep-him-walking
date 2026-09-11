import * as THREE from "three";
import type { ZoneStage } from "../content/schema";
import type { VisualGrade } from "../world/visual-grade";

/**
 * Actor-owned copies of the GLB's own physically based materials. They keep its smooth
 * shading, so he reads as a person rather than a drawing, and add only the world's
 * display grade so he dims and warms with the painting. Source textures and geometries
 * remain owned by the loaded GLB.
 */
export class CharacterAppearance {
  readonly exposure = { value: 1 };
  readonly tint = { value: new THREE.Vector3(1, 1, 1) };
  readonly materials = new Map<THREE.Material, THREE.MeshStandardMaterial>();

  convert(source: THREE.Material): THREE.Material {
    // Eyes are included: left ungraded they stayed daylight-white at night.
    if (!(source instanceof THREE.MeshStandardMaterial)) return source;
    const cached = this.materials.get(source);
    if (cached) return cached;
    const material = source.clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.worldExposure = this.exposure;
      shader.uniforms.worldTint = this.tint;
      shader.fragmentShader = `uniform float worldExposure;\nuniform vec3 worldTint;\n${shader.fragmentShader}`
        .replace("#include <colorspace_fragment>", "#include <colorspace_fragment>\ngl_FragColor.rgb *= worldExposure * worldTint;");
    };
    material.customProgramCacheKey = () => "character-display-grade-v2";
    this.materials.set(source, material);
    return material;
  }

  update(grade: VisualGrade) {
    this.exposure.value = grade.exposure;
    this.tint.value.set(grade.tint.r, grade.tint.g, grade.tint.b);
  }

  dispose() {
    // The copies share the source textures, which the host's GLB disposal releases.
    this.materials.forEach((material) => material.dispose());
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

/**
 * Soft daylight on smooth shading. three divides diffuse light by π: these show a
 * camera-facing face at about 75% of its own colour, the side away from the key at about
 * 45% and the underside of the chin darker still, like a person outdoors. Nothing is added
 * at night; the shared grade alone dims him with the painting.
 */
export class CharacterLights extends THREE.Group {
  readonly hemisphere = new THREE.HemisphereLight(0xffffff, 0x2e3a4f, 1.4);
  readonly key = new THREE.DirectionalLight(0xffffff, 1.8);
  readonly fill = new THREE.DirectionalLight(0x2e3a4f, 0.45);
  constructor() {
    super();
    this.fill.position.set(4, 2, 3);
    this.add(this.hemisphere, this.key, this.fill);
  }
  update(stage: ZoneStage) {
    hintedLight(this.hemisphere.color, stage.palette[0]);
    hintedLight(this.hemisphere.groundColor, stage.palette[2]).multiplyScalar(GROUND_BOUNCE);
    hintedLight(this.key.color, stage.palette[0]);
    this.key.position.set(stage.lightDir === "left" ? -3 : stage.lightDir === "right" ? 3 : 0, 5, 4);
    hintedLight(this.fill.color, stage.palette[2]);
    this.fill.position.x = stage.lightDir === "right" ? -4 : 4;
  }
}
