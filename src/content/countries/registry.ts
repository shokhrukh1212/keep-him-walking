import { tashkentCountryPackV4 } from "./tashkent.v4";
import { tashkentCountryPackV5 } from "./tashkent.v5";
import { dushanbeCountryPackV1 } from "./dushanbe.v1";
import { bishkekCountryPackV1 } from "./bishkek.v1";
import { almatyCountryPackV1 } from "./almaty.v1";
import { bakuCountryPackV1 } from "./baku.v1";
import { tbilisiCountryPackV1 } from "./tbilisi.v1";
import { istanbulCountryPackV1 } from "./istanbul.v1";
import { sofiaCountryPackV1 } from "./sofia.v1";
import { belgradeCountryPackV1 } from "./belgrade.v1";
import { zagrebCountryPackV1 } from "./zagreb.v1";
import { ljubljanaCountryPackV1 } from "./ljubljana.v1";
import { viennaCountryPackV1 } from "./vienna.v1";
import { bratislavaCountryPackV1 } from "./bratislava.v1";
import { pragueCountryPackV1 } from "./prague.v1";
import type { CountryPack } from "@/lib/content/schema";
import { PACK_GEOGRAPHY } from "./geography";
import { authoredCountryPacks } from "./authored";

/**
 * Coordinates and land borders live in one reviewable table, applied here so
 * every registered pack carries them however it was authored. The hand-written
 * packs never went through the factory, so applying this in the factory alone
 * left them at 0,0 — which silently disabled the weather fetch and the vote.
 */
function withGeography(pack: CountryPack): CountryPack {
  const geography = PACK_GEOGRAPHY[pack.assetVersion];
  return geography ? { ...pack, ...geography } : pack;
}

const packs = new Map<string, CountryPack>(([
  [tashkentCountryPackV4.assetVersion, tashkentCountryPackV4],
  [tashkentCountryPackV5.assetVersion, tashkentCountryPackV5],
  [dushanbeCountryPackV1.assetVersion, dushanbeCountryPackV1],
  [bishkekCountryPackV1.assetVersion, bishkekCountryPackV1],
  [almatyCountryPackV1.assetVersion, almatyCountryPackV1],
  [bakuCountryPackV1.assetVersion, bakuCountryPackV1],
  [tbilisiCountryPackV1.assetVersion, tbilisiCountryPackV1],
  [istanbulCountryPackV1.assetVersion, istanbulCountryPackV1],
  [sofiaCountryPackV1.assetVersion, sofiaCountryPackV1],
  [belgradeCountryPackV1.assetVersion, belgradeCountryPackV1],
  [zagrebCountryPackV1.assetVersion, zagrebCountryPackV1],
  [ljubljanaCountryPackV1.assetVersion, ljubljanaCountryPackV1],
  [viennaCountryPackV1.assetVersion, viennaCountryPackV1],
  [bratislavaCountryPackV1.assetVersion, bratislavaCountryPackV1],
  [pragueCountryPackV1.assetVersion, pragueCountryPackV1],
  ...authoredCountryPacks.map((pack) => [pack.assetVersion, pack] as [string, CountryPack]),
] as Array<[string, CountryPack]>).map(([id, pack]) => [id, withGeography(pack)]));

export function getCountryPack(scenePackId: string): CountryPack | null {
  return packs.get(scenePackId) ?? null;
}

export function registeredCountryPacks(): CountryPack[] {
  return [...packs.values()];
}

const phase2Order = ["tashkent-v5", "dushanbe-v1", "bishkek-v1", "almaty-v1", "baku-v1", "tbilisi-v1", "istanbul-v1"];

export const phase3EditorialBufferOrder = ["sofia-v1", "belgrade-v1", "zagreb-v1", "ljubljana-v1", "vienna-v1", "bratislava-v1", "prague-v1"] as const;

export function getNextCountryPack(scenePackId: string): CountryPack | null {
  const index = phase2Order.indexOf(scenePackId);
  return index >= 0 && index < phase2Order.length - 1 ? getCountryPack(phase2Order[index + 1]) : null;
}
