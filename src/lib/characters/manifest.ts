/** Review candidates remain isolated from published country packs. */
export const CHARACTER_MANIFEST = {
  version: 1,
  approval: "visual-review-pending",
  traveler: { url: "/characters/v1/traveler.glb", heightMetres: 1.78 },
  resident: { url: "/characters/v1/almaty-host.glb", heightMetres: 1.68 },
  combinedBudgetBytes: 8 * 1024 * 1024,
} as const;

export const CLIP_DURATIONS = {
  idle: 4, walk: 1.2, greet: 3, talk: 4, listen: 4, react: 3,
  goodbye: 3, drink: 5.5, phone: 4.5, photo: 4, rest: 5,
} as const;
export type CharacterClip = keyof typeof CLIP_DURATIONS;
export type ReviewAction = CharacterClip | "encounter";
export const REVIEW_ACTIONS: { value: ReviewAction; label: string }[] = [
  {value:"idle",label:"Standing"},{value:"walk",label:"Walking"},
  {value:"encounter",label:"Full conversation"},{value:"greet",label:"Greeting"},
  {value:"talk",label:"Speaking"},{value:"listen",label:"Listening"},
  {value:"react",label:"Reacting"},{value:"goodbye",label:"Saying goodbye"},
  {value:"drink",label:"Drinking water"},{value:"phone",label:"Checking phone"},
  {value:"photo",label:"Taking a photograph"},{value:"rest",label:"Sitting down"},
];
