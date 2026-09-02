import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import type { CountryPackV3 } from "@/lib/content/schema";
import { validateRigManifest, validateSpriteManifest } from "./rig-contract";

describe("production traveler delivery contract", () => {
  it("uses the complete sprite contract while keeping the Rive adapter replaceable", () => {
    expect(tashkentCountryPackV4.traveler.driver).toBe("sprite");
    expect(validateRigManifest(tashkentCountryPackV4)).toEqual([]);
  });

  it("still validates the optional future Rive boundary", () => {
    const incompatible = {
      ...tashkentCountryPackV4,
      traveler: {
        ...tashkentCountryPackV4.traveler,
        driver: "rive" as const,
        artboard: "Wrong",
        stateMachine: "Wrong",
        viewModel: "Wrong",
        requiredInputs: [],
      },
    };
    expect(validateRigManifest(incompatible)).toHaveLength(10);
  });

  it("accepts the preserved Rive contract when explicitly selected", () => {
    const rivePack = {
      ...tashkentCountryPackV4,
      traveler: { ...tashkentCountryPackV4.traveler, driver: "rive" as const },
    };
    expect(validateRigManifest(rivePack)).toEqual([]);
  });

  it("reports missing, mismatched and over-budget sprite delivery details", () => {
    const noManifest = {
      ...tashkentCountryPackV4,
      traveler: { ...tashkentCountryPackV4.traveler, spriteManifest: undefined },
    } as CountryPackV3;
    expect(validateSpriteManifest(noManifest)).toEqual(["sprite manifest is required"]);

    const manifest = structuredClone(tashkentCountryPackV4.traveler.spriteManifest!);
    delete manifest.clips.wave;
    manifest.clips.walk!.metadata.pop();
    delete manifest.clips.walk!.strideWorldUnits;
    manifest.maxDecodedCacheBytes = 33 * 1_048_576;
    const invalid = {
      ...tashkentCountryPackV4,
      traveler: { ...tashkentCountryPackV4.traveler, spriteManifest: manifest },
    } as CountryPackV3;
    expect(validateSpriteManifest(invalid)).toEqual(expect.arrayContaining([
      "missing sprite clip wave",
      "sprite clip walk metadata mismatch",
      "walk clip requires strideWorldUnits",
      "sprite decoded cache exceeds low-tier budget",
    ]));
  });
});
