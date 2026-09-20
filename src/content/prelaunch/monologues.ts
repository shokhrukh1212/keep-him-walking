import type { CharacterClip } from "@/lib/characters/manifest";

export type PrelaunchMonologueLine = {
  id: string;
  text: string;
  action?: CharacterClip;
  category?: "greeting" | "ambient" | "journey" | "name" | "sponsor" | "rest";
  requires?: {
    city?: string;
    sponsorOpen?: true;
    scheduled?: true;
    filledRegular?: true;
    before?: "travelStart" | "pollOpens";
  };
  fallback?: string;
};

/** Paris departure-lounge lines using only installed clips and declared fallbacks. */
export const PRELAUNCH_MONOLOGUES: readonly PrelaunchMonologueLine[] = [
  { id: "company", text: "Oh, good. Company. I was about to interview that pigeon.", action: "greet", category: "greeting" },
  { id: "ready", text: "Paris: ready. Backpack: ready. Departure: waiting for the signal.", action: "talk", category: "journey" },
  { id: "give-me-a-name", text: "Before I cross a border, could you give me a name?", action: "notice", category: "name" },
  { id: "packed-light", text: "I packed light. The emotional baggage refused to stay home.", action: "wait_stretch", category: "ambient" },
  { id: "croissant", text: "I'm learning French. So far, every sentence ends in ‘croissant’.", action: "look_up", category: "ambient" },
  { id: "pavement", text: "This isn't a delay. It's a very thorough pavement inspection.", action: "rest", category: "rest" },
  { id: "wave", text: "I saw that wave. Very professional. Excellent wrist work.", action: "greet", category: "ambient" },
  { id: "route", text: "Checking the route again. Yes, it still begins with leaving.", action: "phone", category: "journey" },
  { id: "sponsor", text: "Building something? One of those little spots could be your product.", action: "talk", category: "sponsor", requires: { sponsorOpen: true }, fallback: "I have the route. I have the backpack. The host has the starting signal." },
  { id: "name-open", text: "The name vote is open. My passport is getting impatient.", action: "talk", category: "name" },
  { id: "six-seconds", text: "I've been sitting for six seconds. A remarkable expedition.", action: "rest", category: "rest" },
  { id: "bench-name", text: "Somewhere out there is a bench with my name on it. First, I need a name.", action: "look_up", category: "name" },
  { id: "plan", text: "The plan: new places, questionable directions, excellent company.", action: "talk", category: "journey" },
  { id: "engine", text: "Once we launch, I only walk while somebody watches. You're part of the engine.", action: "talk", category: "journey" },
  { id: "your-city", text: "Where are you watching from? Imagine your city somewhere on this route.", action: "notice", category: "ambient" },
  { id: "filled", text: "{filledRegular} of my ten sponsor spots are taken. I'm practicing my departure face.", action: "talk", category: "sponsor", requires: { filledRegular: true } },
  { id: "departure-time", text: "We have a departure time. Finally, my waiting has a deadline.", action: "wait_watch", category: "journey", requires: { scheduled: true }, fallback: "The host still has the starting signal. I still have the pavement." },
  { id: "first-steps", text: "Come back for the first steps. I'd like witnesses.", action: "talk", category: "greeting" },
] as const;

/**
 * Makes a per-browser departure-lounge running order. The opening remains a greeting,
 * adjacent categories are avoided when possible, and sales lines are kept apart.
 */
export function arrangePrelaunchMonologues(
  lines: readonly PrelaunchMonologueLine[],
  recentOpeners: readonly string[] = [],
  random: () => number = Math.random,
): PrelaunchMonologueLine[] {
  const remaining = lines.map((line) => ({ line, sort: random() })).sort((a, b) => a.sort - b.sort);
  const openerIndex = remaining.findIndex(({ line }) => line.category === "greeting" && !recentOpeners.includes(line.id));
  const fallbackOpener = remaining.findIndex(({ line }) => line.category === "greeting");
  const [opener] = remaining.splice(openerIndex >= 0 ? openerIndex : Math.max(0, fallbackOpener), 1);
  const arranged = opener ? [opener.line] : [];
  let sinceSponsor = arranged[0]?.category === "sponsor" ? 0 : 5;
  while (remaining.length > 0) {
    const previousCategory = arranged.at(-1)?.category;
    let index = remaining.findIndex(({ line }) => line.category !== previousCategory
      && (line.category !== "sponsor" || sinceSponsor >= 4));
    if (index < 0) index = remaining.findIndex(({ line }) => line.category !== previousCategory);
    if (index < 0) index = 0;
    const [next] = remaining.splice(index, 1);
    if (!next) break;
    arranged.push(next.line);
    sinceSponsor = next.line.category === "sponsor" ? 0 : sinceSponsor + 1;
  }
  return arranged;
}
