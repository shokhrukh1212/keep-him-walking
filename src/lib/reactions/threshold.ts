import type { CrowdActionKind } from "@/lib/traveler/motion-clock";

/** The only three things a visitor can send. No free text, ever. */
export const REACTION_KINDS = ["wave", "water", "photo"] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

/** One reaction per kind per visitor per minute. Mirrors the RPC's rate limit. */
export const REACTION_COOLDOWN_SECONDS = 60;

/** Reactions are counted in 30-second buckets. Mirrors reaction_windows. */
export const REACTION_BUCKET_SECONDS = 30;

/** He will not repeat a kind inside this many active seconds. Mirrors the RPC. */
export const REACTION_DEDUPE_ACTIVE_SECONDS = 120;

/** What each reaction asks him to do. 'water' is a drink. */
export const REACTION_MOTION_KIND: Record<ReactionKind, CrowdActionKind> = {
  wave: "wave",
  water: "drink",
  photo: "photo",
};

/**
 * How many watchers have to agree before he does it. Two people is always
 * enough; past six watchers it takes 30 % of the room. The RPC computes the
 * same number — this mirror exists so the button can show "3/5" honestly.
 */
export function reactionThreshold(liveWatchers: number): number {
  const watchers = Number.isFinite(liveWatchers) ? Math.max(0, Math.floor(liveWatchers)) : 0;
  return Math.max(2, Math.ceil(0.3 * watchers));
}
