import { tashkentCountryPackV2 } from "./tashkent.v2";
import { tashkentCountryPackV3 } from "./tashkent.v3";
import type { CountryPack } from "@/lib/content/schema";

const packs = new Map<string, CountryPack>([
  [tashkentCountryPackV2.assetVersion, tashkentCountryPackV2],
  [tashkentCountryPackV3.assetVersion, tashkentCountryPackV3],
]);

export function getCountryPack(scenePackId: string): CountryPack | null {
  return packs.get(scenePackId) ?? null;
}

export function registeredCountryPacks(): CountryPack[] {
  return [...packs.values()];
}
