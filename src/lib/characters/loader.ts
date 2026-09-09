import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { publicAssetUrl } from "@/lib/assets/url";
import type { CharacterDefinition } from "./manifest";

/** Loads the mesh first; a missing optional animation file never takes down the actor. */
export async function loadCharacterGltf(loader: GLTFLoader, definition: CharacterDefinition): Promise<GLTF> {
  const mesh = await loader.loadAsync(publicAssetUrl(definition.url));
  if (!definition.animationUrl) return mesh;
  try {
    const animation = await loader.loadAsync(publicAssetUrl(definition.animationUrl));
    return { ...mesh, animations: [...mesh.animations, ...animation.animations] };
  } catch {
    return mesh;
  }
}
