import { tashkentCountryPackV2 } from "./tashkent.v2";
import { tashkentCountryPackV3 } from "./tashkent.v3";
import { tashkentCountryPackV4 } from "./tashkent.v4";
import { dushanbeCountryPackV1 } from "./dushanbe.v1";
import { bishkekCountryPackV1 } from "./bishkek.v1";
import { almatyCountryPackV1 } from "./almaty.v1";
import { bakuCountryPackV1 } from "./baku.v1";
import { tbilisiCountryPackV1 } from "./tbilisi.v1";
import { istanbulCountryPackV1 } from "./istanbul.v1";
import type { CountryPack } from "@/lib/content/schema";

const packs = new Map<string, CountryPack>([
  [tashkentCountryPackV2.assetVersion, tashkentCountryPackV2],
  [tashkentCountryPackV3.assetVersion, tashkentCountryPackV3],
  [tashkentCountryPackV4.assetVersion, tashkentCountryPackV4],
  [dushanbeCountryPackV1.assetVersion, dushanbeCountryPackV1],
  [bishkekCountryPackV1.assetVersion, bishkekCountryPackV1],
  [almatyCountryPackV1.assetVersion, almatyCountryPackV1],
  [bakuCountryPackV1.assetVersion, bakuCountryPackV1],
  [tbilisiCountryPackV1.assetVersion, tbilisiCountryPackV1],
  [istanbulCountryPackV1.assetVersion, istanbulCountryPackV1],
]);

export function getCountryPack(scenePackId: string): CountryPack | null {
  return packs.get(scenePackId) ?? null;
}

export function registeredCountryPacks(): CountryPack[] {
  return [...packs.values()];
}

const phase2Order = ["tashkent-v4", "dushanbe-v1", "bishkek-v1", "almaty-v1", "baku-v1", "tbilisi-v1", "istanbul-v1"];

export function getNextCountryPack(scenePackId: string): CountryPack | null {
  const index = phase2Order.indexOf(scenePackId);
  return index >= 0 && index < phase2Order.length - 1 ? getCountryPack(phase2Order[index + 1]) : null;
}
