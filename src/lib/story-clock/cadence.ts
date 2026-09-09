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
  if (dayEndsAt.getTime() <= dayStartsAt.getTime()) {
    throw new Error("Country-day window must be positive");
  }
  // Route beats are distance-owned by the motion clock. Departure is the sole
  // wall-clock beat and begins exactly at rollover even if nobody watched.
  return pack.storyBeats
    .filter((beat) => beat.kind === "departure")
    .map((beat) => {
      const startsAt = dayEndsAt;
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
