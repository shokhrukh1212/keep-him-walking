/** A launch announcement is shown only on the scheduled day in the current city. */
export function launchCelebrationAt(startsAt: string | null, nowMs: number, timeZone: string) {
  if (!startsAt) return null;
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs) || nowMs >= startMs) return null;
  const localDate = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  if (localDate.format(new Date(nowMs)) !== localDate.format(new Date(startMs))) return null;
  const localTime = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(startMs));
  const utcTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(startMs));
  return {
    localTime,
    utcTime,
    shareText: `Milo starts walking in Paris today at ${localTime} France time (${utcTime} UTC). Come watch and support his journey!`,
  };
}

/** The waiting card may name a start only after the server has scheduled it. */
export function prelaunchStartLine(startsAt: string | null, timeZone: string): string {
  if (!startsAt || !Number.isFinite(Date.parse(startsAt))) return "Milo is getting ready for his first walk.";
  const instant = new Date(startsAt);
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(instant);
  return `Milo starts walking in Paris on ${local} France time.`;
}
