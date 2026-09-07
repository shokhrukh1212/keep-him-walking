import type { CountryPackV3 } from "@/lib/content/schema";

export type ScheduledBeat = CountryPackV3["storyBeats"][number] & {
  startsAt: string;
  endsAt: string;
};

export function scheduleStoryBeats(
  pack: CountryPackV3,
  dayStartsAt: Date,
  dayEndsAt: Date,
): ScheduledBeat[] {
  const durationMs = dayEndsAt.getTime() - dayStartsAt.getTime();
  if (durationMs <= 0) throw new Error("Country-day window must be positive");
  return [...pack.storyBeats]
    .sort((left, right) => left.atFraction - right.atFraction)
    .map((beat) => {
      const startsAt = new Date(dayStartsAt.getTime() + durationMs * beat.atFraction);
      return {
        ...beat,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + beat.durationSeconds * 1_000).toISOString(),
      };
    });
}

export function missedMajorBeats(beats: ScheduledBeat[], storyNow: Date): ScheduledBeat[] {
  const nowMs = storyNow.getTime();
  return beats.filter((beat) => new Date(beat.endsAt).getTime() <= nowMs);
}
