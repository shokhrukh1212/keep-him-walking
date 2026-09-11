/** Character assets stay independent from country packs and can be reviewed before activation. */
export type CharacterDefinition = {
  url: string;
  heightMetres: number;
  /** Known-good model used while an owner-supplied replacement has not landed yet. */
  fallbackUrl?: string;
  /** Optional skeleton-only GLB. Tracks bind to the mesh skeleton by bone name. */
  animationUrl?: string;
};

/** The two base residents. A route pack names its own in `npcSystem.baseType`. */
export const RESIDENT_TYPES = ["resident-a", "resident-b"] as const;
export type ResidentType = (typeof RESIDENT_TYPES)[number];

export const CHARACTER_MANIFEST: {
  version: number;
  approval: "visual-review-pending";
  traveler: CharacterDefinition;
  residents: Record<ResidentType, CharacterDefinition>;
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
  // Both residents carry only their own Mixamo takes (2026-09-11). Their models hold no
  // clips, so a missing take plays its declared fallback rather than a V2 procedural one.
  residents: {
    // The woman: the Almaty host, rebuilt with the garment repairs.
    "resident-a": {
      url: "/characters/v3/resident-a.glb",
      fallbackUrl: "/characters/v2/almaty-host.glb?rev=interactions-1",
      animationUrl: "/characters/v3/resident-a-animations.glb",
      heightMetres: 1.68,
    },
    // The man. A little shorter than the traveler, so he stays the tallest figure in frame.
    "resident-b": {
      url: "/characters/v3/resident-b.glb",
      animationUrl: "/characters/v3/resident-b-animations.glb",
      heightMetres: 1.75,
    },
  },
  // Every shipped model is meshopt-compressed. Measured 2026-09-11: traveler 2.48 MiB
  // model + 1.88 MiB takes; resident A 1.23 + 0.52 MiB; resident B 1.74 + 0.56 MiB.
  // A page loads the traveler and its pack's resident, and the other resident only
  // when a walker needs it. Nothing enforces this figure and the V3 traveler alone
  // already passes it (AFTER-P22 D1); it stays as the line an uncompressed rig
  // shipping again would be measured against.
  combinedBudgetBytes: 5 * 1024 * 1024,
};

type ResidentSet = Partial<Record<ResidentType, CharacterDefinition>>;

export const CHARACTER_CANDIDATES = {
  v2: {
    label: "Active — v3 when installed, v2 fallback",
    traveler: CHARACTER_MANIFEST.traveler,
    residents: CHARACTER_MANIFEST.residents,
  },
  v1: {
    label: "Rejected baseline v1",
    traveler: { url: "/characters/v1/traveler.glb", heightMetres: 1.78 },
    residents: { "resident-a": { url: "/characters/v1/almaty-host.glb", heightMetres: 1.68 } },
  },
} satisfies Record<string, { label: string; traveler: CharacterDefinition; residents: ResidentSet }>;
export type CharacterCandidate = keyof typeof CHARACTER_CANDIDATES;

/** A candidate's resident of this type, or nothing when that candidate never had one. */
export function candidateResident(candidate: CharacterCandidate, type: ResidentType): CharacterDefinition | undefined {
  const residents: ResidentSet = CHARACTER_CANDIDATES[candidate].residents;
  return residents[type];
}

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
