import { parisCountryPackV1 } from "./paris.v1";
import { parisCountryPackV2 } from "./paris.v2";
import type { CountryPack } from "@/lib/content/schema";

export const authoredCountryPacks: CountryPack[] = [
  parisCountryPackV1,
  parisCountryPackV2,
];
