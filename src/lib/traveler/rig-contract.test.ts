import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { validateRigManifest } from "./rig-contract";

describe("production Rive delivery contract", () => {
  it("keeps Phase 2 packs bound to the replaceable production rig contract", () => {
    expect(validateRigManifest(tashkentCountryPackV4)).toEqual([]);
  });

  it("reports every incompatible manifest boundary", () => {
    const incompatible = {
      ...tashkentCountryPackV4,
      traveler: {
        ...tashkentCountryPackV4.traveler,
        artboard: "Wrong",
        stateMachine: "Wrong",
        viewModel: "Wrong",
        requiredInputs: [],
      },
    };
    expect(validateRigManifest(incompatible)).toHaveLength(10);
  });
});
