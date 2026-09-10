/** Character assets stay independent from country packs and can be reviewed before activation. */
export type CharacterDefinition = {
  url: string;
  heightMetres: number;
  /** Known-good model used while an owner-supplied replacement has not landed yet. */
  fallbackUrl?: string;
  /** Optional skeleton-only GLB. Tracks bind to the mesh skeleton by bone name. */
  animationUrl?: string;
};

export const CHARACTER_MANIFEST: {
  version: number;
  approval: "visual-review-pending";
  traveler: CharacterDefinition;
  resident: CharacterDefinition;
  combinedBudgetBytes: number;
} = {
  version: 3,
  approval: "visual-review-pending",
  traveler: {
    url: "/characters/v3/traveler.glb",
    fallbackUrl: "/characters/v2/traveler.glb?rev=interactions-1",
    animationUrl: "/characters/v3/traveler-animations.glb",
    heightMetres: 1.78,
  },
  resident: { url: "/characters/v2/almaty-host.glb?rev=interactions-1", heightMetres: 1.68 },
  // Both shipped models are meshopt-compressed: 2.48 MiB + 1.77 MiB measured.
  // The budget leaves room for the V3 traveler without leaving room for a
  // regression that ships an uncompressed rig again.
  combinedBudgetBytes: 5 * 1024 * 1024,
};

export const CHARACTER_CANDIDATES = {
  v2: {
    label: "Active — v3 when installed, v2 fallback",
    traveler: CHARACTER_MANIFEST.traveler,
    resident: CHARACTER_MANIFEST.resident,
  },
  v1: {
    label: "Rejected baseline v1",
    traveler: { url: "/characters/v1/traveler.glb", heightMetres: 1.78 },
    resident: { url: "/characters/v1/almaty-host.glb", heightMetres: 1.68 },
  },
} satisfies Record<string, { label: string; traveler: CharacterDefinition; resident: CharacterDefinition }>;
export type CharacterCandidate = keyof typeof CHARACTER_CANDIDATES;

/**
 * Runtime names, nominal durations, source aliases, and honest fallbacks for absent takes.
 * A duration is the length of the installed V3 Mixamo take (2026-09-10) where one exists and
 * the V2 authored length otherwise. Timelines schedule against these numbers; the actor maps
 * them onto the take a character actually carries, so the V2 resident and any fallback play
 * their own take over the same scheduled interval.
 */
export const CLIP_SPECS = {
  idle: { duration: 9.93, aliases: ["idle", "standing idle"], fallback: null },
  walk: { duration: 1.2, aliases: ["walk", "walking", "walking in place"], fallback: null },
  walk_brisk: { duration: 1.2, aliases: ["walk_brisk", "walking brisk", "brisk walk"], fallback: "walk" },
  greet: { duration: 4.73, aliases: ["greet", "greeting", "waving"], fallback: "idle" },
  talk: { duration: 3.93, aliases: ["talk", "talking"], fallback: "idle" },
  listen: { duration: 4, aliases: ["listen", "listening", "idle listening"], fallback: "idle" },
  react: { duration: 9.77, aliases: ["react", "reaction", "surprised"], fallback: "idle" },
  goodbye: { duration: 4.73, aliases: ["goodbye", "waving goodbye"], fallback: "greet" },
  drink: { duration: 8.87, aliases: ["drink", "drinking"], fallback: "idle" },
  phone: { duration: 23.57, aliases: ["phone", "texting while standing"], fallback: "idle" },
  photo: { duration: 4, aliases: ["photo", "taking selfie"], fallback: "idle" },
  photo_pose: { duration: 4, aliases: ["photo_pose", "photo pose", "thumbs up"], fallback: "photo" },
  rest: { duration: 3.33, aliases: ["rest", "leaning idle"], fallback: "idle" },
  notice: { duration: 1, aliases: ["notice"], fallback: "idle" },
  stop: { duration: 1.2, aliases: ["stop"], fallback: "idle" },
  turn: { duration: 1.2, aliases: ["turn", "turn left 90"], fallback: "idle" },
  resume: { duration: 2.93, aliases: ["resume", "resume walk"], fallback: "walk" },
  walk_start: { duration: 2.93, aliases: ["walk_start", "walk start"], fallback: "walk" },
  walk_stop: { duration: 1.2, aliases: ["walk_stop", "walk stop"], fallback: "stop" },
  wait_pockets: { duration: 5, aliases: ["wait_pockets", "standing idle hands in pockets"], fallback: "idle" },
  wait_watch: { duration: 4, aliases: ["wait_watch", "checking watch"], fallback: "notice" },
  wait_stretch: { duration: 8.87, aliases: ["wait_stretch", "stretching"], fallback: "idle" },
  wait_yawn: { duration: 8.33, aliases: ["wait_yawn", "yawn"], fallback: "idle" },
  sit_down: { duration: 2.23, aliases: ["sit_down", "sit down"], fallback: "rest" },
  sitting: { duration: 4.3, aliases: ["sitting", "sitting idle"], fallback: "rest" },
  stand_up: { duration: 2.27, aliases: ["stand_up", "stand up"], fallback: "resume" },
  sleep: { duration: 1, aliases: ["sleep", "sleeping idle"], fallback: "sitting" },
  look_up: { duration: 6.33, aliases: ["look_up", "look up", "admire"], fallback: "notice" },
  tie_shoe: { duration: 2.77, aliases: ["tie_shoe", "tie shoe"], fallback: "rest" },
  umbrella_walk: { duration: 1.2, aliases: ["umbrella_walk", "holding umbrella walk"], fallback: "walk" },
  stumble: { duration: 2.77, aliases: ["stumble", "trip"], fallback: "stop" },
  cheer: { duration: 4.5, aliases: ["cheer", "victory", "fist pump"], fallback: "react" },
} as const;

export type CharacterClip = keyof typeof CLIP_SPECS;
export const CLIP_DURATIONS = Object.fromEntries(
  Object.entries(CLIP_SPECS).map(([name, spec]) => [name, spec.duration]),
) as Record<CharacterClip, number>;

export type ReviewAction = CharacterClip | "encounter";
export const REVIEW_ACTIONS: { value: ReviewAction; label: string }[] = [
  { value: "idle", label: "Standing" },
  { value: "walk", label: "Walking" },
  { value: "encounter", label: "Full conversation" },
  ...Object.keys(CLIP_SPECS)
    .filter((name) => !["idle", "walk"].includes(name))
    .map((name) => ({ value: name as CharacterClip, label: name.replaceAll("_", " ") })),
];

export function normalizedClipName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function clipFallbackChain(clip: CharacterClip): CharacterClip[] {
  const chain: CharacterClip[] = [clip];
  let current: CharacterClip | null = CLIP_SPECS[clip].fallback;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = CLIP_SPECS[current].fallback;
  }
  return chain;
}
