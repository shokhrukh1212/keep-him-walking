import { describe, expect, it, vi } from "vitest";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadCharacterGltf } from "./loader";

function gltf(animations: GLTF["animations"] = []): GLTF {
  return { animations } as GLTF;
}

const definition = {
  url: "/characters/v3/traveler.glb",
  fallbackUrl: "/characters/v2/traveler.glb",
  animationUrl: "/characters/v3/traveler-animations.glb",
  heightMetres: 1.78,
};

describe("loadCharacterGltf", () => {
  it("combines an installed v3 model with its separate animation file", async () => {
    const mesh = gltf([{ name: "idle" } as GLTF["animations"][number]]);
    const takes = gltf([{ name: "greet" } as GLTF["animations"][number]]);
    const loadAsync = vi.fn().mockResolvedValueOnce(mesh).mockResolvedValueOnce(takes);

    const result = await loadCharacterGltf({ loadAsync } as unknown as GLTFLoader, definition);

    expect(loadAsync.mock.calls.map(([url]) => url)).toEqual([definition.url, definition.animationUrl]);
    expect(result.animations.map(({ name }) => name)).toEqual(["idle", "greet"]);
  });

  it("uses v2 without trying v3 animations when the preferred model is absent", async () => {
    const fallback = gltf();
    const loadAsync = vi.fn().mockRejectedValueOnce(new Error("missing")).mockResolvedValueOnce(fallback);

    const result = await loadCharacterGltf({ loadAsync } as unknown as GLTFLoader, definition);

    expect(result).toBe(fallback);
    expect(loadAsync.mock.calls.map(([url]) => url)).toEqual([definition.url, definition.fallbackUrl]);
  });

  it("keeps the preferred model when only its optional animation file is absent", async () => {
    const mesh = gltf();
    const loadAsync = vi.fn().mockResolvedValueOnce(mesh).mockRejectedValueOnce(new Error("missing"));

    await expect(loadCharacterGltf({ loadAsync } as unknown as GLTFLoader, definition)).resolves.toBe(mesh);
  });
});
