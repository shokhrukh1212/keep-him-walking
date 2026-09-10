import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { publicAssetUrl } from "@/lib/assets/url";
import type { CharacterDefinition } from "./manifest";

/**
 * The shipped models are meshopt-compressed, and the extension is declared as
 * required, so a loader without the decoder throws rather than silently drawing
 * nothing. Attaching it here covers every stage that loads a character.
 */
export function withMeshoptDecoder<T extends GLTFLoader>(loader: T): T {
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/** Loads the preferred mesh, retaining the reviewed fallback until its replacement lands. */
export async function loadCharacterGltf(loader: GLTFLoader, definition: CharacterDefinition): Promise<GLTF> {
  withMeshoptDecoder(loader);
  let mesh: GLTF;
  try {
    mesh = await loader.loadAsync(publicAssetUrl(definition.url));
  } catch (error) {
    if (!definition.fallbackUrl) throw error;
    // Animation takes target the preferred rig, so do not attach them to the fallback.
    return loader.loadAsync(publicAssetUrl(definition.fallbackUrl));
  }
  if (!definition.animationUrl) return mesh;
  try {
    const animation = await loader.loadAsync(publicAssetUrl(definition.animationUrl));
    return { ...mesh, animations: [...mesh.animations, ...animation.animations] };
  } catch {
    return mesh;
  }
}
