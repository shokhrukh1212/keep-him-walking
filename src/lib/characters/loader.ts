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

/**
 * Loads the preferred mesh, retaining the reviewed fallback until its replacement lands.
 *
 * The mesh and its takes are two files of a few megabytes on one HTTP/2 origin, and
 * asking for them in turn made a visitor wait for the sum of the two before anyone
 * could be drawn. They are requested together, and a failed take set still leaves him
 * standing there with whatever clips his own file carries.
 */
export async function loadCharacterGltf(loader: GLTFLoader, definition: CharacterDefinition): Promise<GLTF> {
  withMeshoptDecoder(loader);
  // Both requests are made before either is awaited: the mesh first, because it is the
  // one a fallback replaces. The take set is settled as it is created, so a failure
  // while the mesh is still arriving is never an unhandled rejection.
  const meshRequest = loader.loadAsync(publicAssetUrl(definition.url));
  const takes: Promise<GLTF | null> = definition.animationUrl
    ? loader.loadAsync(publicAssetUrl(definition.animationUrl)).then((gltf) => gltf, () => null)
    : Promise.resolve(null);
  let mesh: GLTF;
  try {
    mesh = await meshRequest;
  } catch (error) {
    if (!definition.fallbackUrl) throw error;
    // Animation takes target the preferred rig, so the set asked for above is dropped
    // rather than attached to the fallback.
    return loader.loadAsync(publicAssetUrl(definition.fallbackUrl));
  }
  const animation = await takes;
  if (!animation) return mesh;
  return { ...mesh, animations: [...mesh.animations, ...animation.animations] };
}
