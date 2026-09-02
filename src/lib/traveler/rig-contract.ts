import type { CountryPackV3 } from "@/lib/content/schema";

export const REQUIRED_TRAVELER_ACTIONS = [
  "idle", "start_walk", "walk", "slow_walk", "stop", "notice",
  "approach", "greet", "talk", "listen", "react", "goodbye",
  "wave", "phone", "drink", "photo", "sit", "rest", "resume_walk",
] as const;

export const REQUIRED_RIVE_INPUTS = [
  "walking", "walkingSpeed", "action", "mood", "facingRight", "reducedMotion", "sponsorPatch",
] as const;

export function validateRigManifest(pack: CountryPackV3): string[] {
  if (pack.traveler.driver === "sprite") return validateSpriteManifest(pack);
  const errors: string[] = [];
  if (pack.traveler.artboard !== "JourneyCharacter") errors.push("artboard must be JourneyCharacter");
  if (pack.traveler.stateMachine !== "JourneyMachine") errors.push("state machine must be JourneyMachine");
  if (pack.traveler.viewModel !== "JourneyCharacterVM") errors.push("view model must be JourneyCharacterVM");
  const inputs = new Set(pack.traveler.requiredInputs ?? []);
  for (const input of REQUIRED_RIVE_INPUTS) if (!inputs.has(input)) errors.push(`missing Rive input ${input}`);
  return errors;
}

export function validateSpriteManifest(pack: CountryPackV3): string[] {
  const errors: string[] = [];
  const manifest = pack.traveler.spriteManifest;
  if (!manifest) return ["sprite manifest is required"];
  for (const action of REQUIRED_TRAVELER_ACTIONS) {
    const clip = manifest.clips[action];
    if (!clip) errors.push(`missing sprite clip ${action}`);
    else if (clip.frames.length !== clip.metadata.length) errors.push(`sprite clip ${action} metadata mismatch`);
  }
  if (!manifest.clips.walk?.strideWorldUnits) errors.push("walk clip requires strideWorldUnits");
  if (manifest.maxDecodedCacheBytes > 32 * 1_048_576) errors.push("sprite decoded cache exceeds low-tier budget");
  return errors;
}
