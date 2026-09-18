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
    const setMeshoptDecoder = vi.fn();

    const result = await loadCharacterGltf({ loadAsync, setMeshoptDecoder } as unknown as GLTFLoader, definition);

    // The shipped models are meshopt-compressed and declare the extension as
    // required, so a loader without the decoder would throw instead of drawing.
    expect(setMeshoptDecoder).toHaveBeenCalledTimes(1);

    expect(loadAsync.mock.calls.map(([url]) => url)).toEqual([definition.url, definition.animationUrl]);
    expect(result.animations.map(({ name }) => name)).toEqual(["idle", "greet"]);
  });

  it("asks for the mesh and its takes together rather than one after the other", async () => {
    let releaseMesh: (value: GLTF) => void = () => {};
    const mesh = new Promise<GLTF>((resolve) => { releaseMesh = resolve; });
    const loadAsync = vi.fn().mockReturnValueOnce(mesh).mockResolvedValueOnce(gltf());

    const result = loadCharacterGltf({ loadAsync, setMeshoptDecoder: vi.fn() } as unknown as GLTFLoader, definition);
    await Promise.resolve();

    // The takes are already being fetched while the mesh is still in flight.
    expect(loadAsync.mock.calls.map(([url]) => url)).toEqual([definition.url, definition.animationUrl]);
    releaseMesh(gltf());
    await result;
  });

  it("uses v2 when the preferred model is absent, and never attaches v3 takes to it", async () => {
    const fallback = gltf([{ name: "v2-idle" } as GLTF["animations"][number]]);
    const loadAsync = vi.fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce(gltf([{ name: "greet" } as GLTF["animations"][number]]))
      .mockResolvedValueOnce(fallback);

    const result = await loadCharacterGltf({ loadAsync, setMeshoptDecoder: vi.fn() } as unknown as GLTFLoader, definition);

    expect(result).toBe(fallback);
    // The take set was requested beside the mesh; the fallback keeps only its own clips.
    expect(loadAsync.mock.calls.map(([url]) => url))
      .toEqual([definition.url, definition.animationUrl, definition.fallbackUrl]);
  });

  it("keeps the preferred model when only its optional animation file is absent", async () => {
    const mesh = gltf();
    const loadAsync = vi.fn().mockResolvedValueOnce(mesh).mockRejectedValueOnce(new Error("missing"));

    await expect(loadCharacterGltf(
      { loadAsync, setMeshoptDecoder: vi.fn() } as unknown as GLTFLoader, definition,
    )).resolves.toBe(mesh);
  });
});
