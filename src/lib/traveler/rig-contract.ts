import type { CountryPackV3 } from "@/lib/content/schema";

export const REQUIRED_TRAVELER_ACTIONS = [
  "idle", "start_walk", "walk", "slow_walk", "stop", "notice",
  "approach", "greet", "talk", "listen", "react", "goodbye",
] as const;

export const REQUIRED_RIVE_INPUTS = [
  "walking", "walkingSpeed", "action", "mood", "facingRight", "reducedMotion", "sponsorPatch",
] as const;

export function validateRigManifest(pack: CountryPackV3): string[] {
  const errors: string[] = [];
  if (pack.traveler.artboard !== "JourneyCharacter") errors.push("artboard must be JourneyCharacter");
  if (pack.traveler.stateMachine !== "JourneyMachine") errors.push("state machine must be JourneyMachine");
  if (pack.traveler.viewModel !== "JourneyCharacterVM") errors.push("view model must be JourneyCharacterVM");
  const inputs = new Set(pack.traveler.requiredInputs ?? []);
  for (const input of REQUIRED_RIVE_INPUTS) if (!inputs.has(input)) errors.push(`missing Rive input ${input}`);
  return errors;
}
