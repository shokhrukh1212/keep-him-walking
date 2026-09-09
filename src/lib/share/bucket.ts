/** Honest display buckets for public cards; single-digit audiences stay exact. */
export function watcherBucket(count: number) {
  const confirmed = Math.max(0, Math.floor(count));
  if (confirmed < 10) return `${confirmed} watching`;
  const width = confirmed < 100 ? 25 : confirmed < 1_000 ? 100 : 1_000;
  const lower = Math.floor(confirmed / width) * width;
  return `${lower.toLocaleString()}–${(lower + width - 1).toLocaleString()} watching`;
}
