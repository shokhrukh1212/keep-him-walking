import type { CountryPack } from "@/lib/content/schema";
import { deterministicVariant } from "@/lib/world/route-clock";
import { WALKER_BLOCK_SECONDS } from "@/lib/world/walkers";
import { RESIDENT_TYPES, type ResidentType } from "./manifest";

/** The resident a city's conversation uses. The pack names it; nothing else decides. */
export function packResidentType(pack: CountryPack): ResidentType {
  return pack.schemaVersion === 3 ? pack.npcSystem.baseType : "resident-a";
}

/**
 * Which base resident the next background walker is. Walkers are never cloned from one
 * model: with one already out, the next is the other resident. The first of an appearance
 * alternates between them by the shared active-seconds block, so every viewer sees the
 * same person.
 */
export function walkerResidentType(
  present: readonly ResidentType[],
  seed: string,
  activeSecond: number,
): ResidentType {
  if (present.length > 0) {
    const absent = RESIDENT_TYPES.find((type) => !present.includes(type));
    if (!absent) throw new RangeError("Both residents are already walking");
    return absent;
  }
  const second = Number.isFinite(activeSecond) ? Math.max(0, activeSecond) : 0;
  // Passes are scheduled per block, so one choice covers every pass of a block.
  const block = Math.floor(second / WALKER_BLOCK_SECONDS);
  return RESIDENT_TYPES[deterministicVariant(`${seed}:walker-resident`, block, RESIDENT_TYPES.length)]!;
}
