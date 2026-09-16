import type { PrelaunchMonologueLine } from "@/content/prelaunch/monologues";

/**
 * The eight Season 1 preview lines used before "The Anniversary Journey". They stay as a test
 * fixture because they exercise every scheduler condition: a city line, a sponsor line and
 * plain lines.
 */
export const SCHEDULER_FIXTURE_LINES: readonly PrelaunchMonologueLine[] = [
  {
    id: "waiting-in-paris",
    text: "Right now, I’m waiting in Paris. Once Season 1 starts, I’ll only walk while someone is watching.",
    requires: { city: "Paris" },
    fallback: "Right now, I’m waiting here. Once Season 1 starts, I’ll only walk while someone is watching.",
  },
  {
    id: "packed-for-seven",
    text: "I’ve packed for seven cities. Somehow, I still think I forgot something.",
  },
  {
    id: "paris-first",
    text: "Paris first. I’m trying to look like I know where I’m going.",
    requires: { city: "Paris" },
    fallback: "First city first. I’m trying to look like I know where I’m going.",
  },
  {
    id: "during-the-season",
    text: "During the season, you can wave, offer water, or ask for a photo. For now, I’m practicing my patient face.",
  },
  {
    id: "first-hello",
    text: "Someone has to be the first to say hello. Today, that’s me.",
  },
  {
    id: "one-bag",
    text: "Seven cities, one bag. I may have overpacked.",
  },
  {
    id: "looking-for-a-sponsor",
    text: "The first season is looking for a sponsor. If you’re building something, the Sponsor button has the details.",
    requires: { sponsorOpen: true },
    fallback: "Every long walk starts with standing still for a while. I’m getting good at that part.",
  },
  {
    id: "thanks-for-stopping-by",
    text: "Thanks for stopping by. A little company makes the waiting better.",
  },
];
