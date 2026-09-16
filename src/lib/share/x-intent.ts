import { ANNIVERSARY_JOURNEY, ANNIVERSARY_LABELS } from "@/lib/season/anniversary";

export const SHARE_SITE_URL = "https://keephimwalking.com";

/**
 * X's compose page with a prefilled draft. The visitor reviews it and presses Post
 * themselves; nothing is ever posted for them.
 */
export function xComposeUrl(text: string, url: string = SHARE_SITE_URL): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export type ShareMoment =
  | { state: "prelaunch" }
  | { state: "live"; dayNumber: number; totalDays: number; cityName: string }
  | { state: "completed" };

/** The draft's words: where the shared journey is. No counts and no claims about the visitor. */
export function anniversaryShareText(moment: ShareMoment): string {
  const name = `Keep Him Walking: ${ANNIVERSARY_JOURNEY.title}`;
  if (moment.state === "prelaunch") {
    return `${name}. A fourteen-day virtual journey starts ${ANNIVERSARY_LABELS.travelStarts}, and he only walks while someone is watching.`;
  }
  if (moment.state === "live") {
    return `Day ${moment.dayNumber} of ${moment.totalDays} on ${name}. He's in ${moment.cityName} and only walks while someone is watching.`;
  }
  return `${name} is complete. The anniversary update is on the way.`;
}
