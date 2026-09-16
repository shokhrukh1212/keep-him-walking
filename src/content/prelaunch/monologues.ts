import { ANNIVERSARY_LABELS } from "@/lib/season/anniversary";

/**
 * What he says to visitors while "The Anniversary Journey" waits to start. Owner-authored
 * copy, edited here; he says the lines in this order and then starts again.
 *
 * A line that is only true in some situations names its condition, and the neutral line
 * he says instead when there is one. A dated line without a fallback simply drops out once
 * its moment has passed. Nothing here may claim live weather, visitor numbers, completed
 * travel or a confirmed sponsor.
 */
export type PrelaunchMonologueLine = {
  id: string;
  text: string;
  /** Said only when every condition holds; otherwise `fallback` (if any) is said in its place. */
  requires?: {
    /** The prelaunch scene is this city. */
    city?: string;
    /** A season sponsorship is genuinely open for requests right now. */
    sponsorOpen?: true;
    /** Only before this scheduled instant, read on the server-synchronized clock. */
    before?: "travelStart" | "pollOpens";
  };
  fallback?: string;
};

export const PRELAUNCH_MONOLOGUES: readonly PrelaunchMonologueLine[] = [
  {
    id: "journey-starts",
    text: `My fourteen-day journey starts ${ANNIVERSARY_LABELS.travelStarts}.`,
    requires: { before: "travelStart" },
  },
  {
    id: "first-anniversary",
    text: `My maker’s first wedding anniversary is ${ANNIVERSARY_LABELS.anniversary}.`,
  },
  {
    id: "virtual-journey",
    text: "I’m taking the virtual journey. He’s planning the surprise in Tashkent.",
  },
  {
    id: "watching-keeps-me-walking",
    text: "Once we start, watching is what keeps me walking.",
    requires: { before: "travelStart" },
  },
  {
    id: "choose-the-setting",
    text: `You’ll help choose the anniversary setting. Voting opens ${ANNIVERSARY_LABELS.pollOpens}.`,
    requires: { before: "pollOpens" },
  },
  {
    id: "watching-is-free",
    text: "Watching is free. Thanks for keeping me company.",
  },
];
