/**
 * The one number the page calls "people watching".
 *
 * Two server-confirmed sources answer it. The server's presence leases are the
 * authority that decides whether he walks; DataFast's site analytics count everyone
 * with a page of the site open, including the pages he is not on. DataFast lags by up
 * to ten minutes and misses a blocked script, so it reads 0 while Postgres has three
 * watchers — and "0 people watching" beside a walking traveler contradicts the one
 * rule the page is built on.
 *
 * So the shown count is never below the confirmed watchers. Nothing is invented here:
 * both inputs come from the server, and the larger of two true counts is the one that
 * cannot contradict the walk.
 */
export function peopleWatching(
  confirmedWatchers: number | null | undefined,
  onlineVisitors: number | null | undefined,
): number | null {
  const confirmed = wholeCount(confirmedWatchers);
  const online = wholeCount(onlineVisitors);
  if (confirmed === null && online === null) return null;
  return Math.max(confirmed ?? 0, online ?? 0);
}

function wholeCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
