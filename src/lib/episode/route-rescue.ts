/**
 * Episode 2, "Route rescue: one way out of Paris" (17:00–18:00 UTC, 24 September 2026).
 *
 * Same system as Episode 1 (`paris-readiness.ts`): a pure function of the configured
 * timestamps, the synchronized clock, the server's authoritative start and this browser's
 * own choices. It never writes launch state and nothing in it is required for launch.
 *
 * Witnesses are the individual fallback: the most people watching at once since 17:00, as
 * this page saw the header's count. Presence is not recorded before launch, so a cumulative
 * distinct-visitor count cannot be built from existing data. Polls are the individual-choice
 * fallback, exactly as in Episode 1.
 */
import { SEASON_ONE_ROUTE } from "@/lib/season/anniversary";
import { lay, lineSeconds, sequenceSeconds, type EpisodeLine, type TimedLine } from "./paris-readiness";

export type RouteRescueConfig = {
  id: string;
  episode2StartAt: string;
  stampCeremonyAt: string;
  finalLinesAt: string;
  actualLaunchAt: string;
  witnessGoal: number;
  milestones: readonly number[];
};

export const ROUTE_RESCUE_EPISODE: RouteRescueConfig = {
  id: "route-rescue-2026-09-24",
  episode2StartAt: "2026-09-24T17:00:00Z",
  stampCeremonyAt: "2026-09-24T17:50:00Z",
  finalLinesAt: "2026-09-24T17:59:20Z",
  actualLaunchAt: "2026-09-24T18:00:00Z",
  witnessGoal: 30,
  milestones: [10, 20, 30, 50, 100],
};

/** The real route: the first stop after Paris, and how many countries in all. */
export const FIRST_STOP = SEASON_ONE_ROUTE[1];
export const ROUTE_COUNTRIES = SEASON_ONE_ROUTE.length;

const M = (text: string): EpisodeLine => ({ speaker: "milo", text });
const C = (text: string): EpisodeLine => ({ speaker: "camille", text });
type Pair = EpisodeLine[];

export type RescuePollId = "gift" | "lastWords";
export type RescueChoices = { gift?: number; lastWords?: number };

export type RescuePoll = {
  id: RescuePollId;
  question: string;
  options: readonly string[];
  opensAtSec: number;
  closesAtSec: number;
  results: readonly Pair[];
};

export const RESCUE_POLLS: Record<RescuePollId, RescuePoll> = {
  gift: {
    id: "gift",
    question: "What should Milo give Camille for her help?",
    options: ["A photo together", "His water bottle", "A real postcard from every country"],
    opensAtSec: 10 * 60,
    closesAtSec: 12 * 60,
    results: [
      [M("One photograph. Both of us. For your fridge."), C("My fridge has high standards."), M("Use the good angle. The one where I look employed.")],
      [M("My water bottle. My only reliable possession."), C("You'll need it more than me."), M("Then I'll carry it for both of us."), C("That's the most sensible thing you've said today.")],
      [M("A postcard from every country. A real one."), C("Not Paris."), M("Not Paris. I promise. Fourteen new views."), C("I'll be checking the stamps.")],
    ],
  },
  lastWords: {
    id: "lastWords",
    question: "Milo's last words in Paris?",
    options: ["Bonjour.", "Thank you, Camille.", "Nobody look away."],
    opensAtSec: 34 * 60,
    closesAtSec: 36 * 60,
    results: [[C("Good choice. Save it for six o'clock."), M("I'm rehearsing it silently. Very intensely.")]],
  },
};

type Scene = { id: string; atSec: number; title: string; lines: EpisodeLine[]; interstitials: Pair[] };

const stop = FIRST_STOP.country;

export const RESCUE_SCENES: Scene[] = [
  {
    id: "real-plan", atSec: 5, title: "The real plan",
    lines: [
      C("Right. Postcards away. Real directions out."), M("Can the postcards come as emotional support?"),
      C("In the backpack. Not in charge."), M("Understood. They've been demoted."),
      C("First question. Do you know which way the station is?"), M("It's the enormous building I've been staring at for days."),
      C("Good. That's a start."),
    ],
    interstitials: [
      [M("Is there a shortcut out of Paris?"), C("Nobody has found one in two thousand years.")],
      [C("Stop looking at the pigeons."), M("They've seen me every day. We're close now.")],
      [M("Do real travelers carry maps?"), C("Real travelers carry directions.")],
    ],
  },
  {
    id: "witnesses", atSec: 6 * 60, title: "Paris rule: witnesses",
    lines: [
      C("One more thing. In Paris, a departure needs witnesses."), M("Is that a law?"),
      C("It's a tradition. I just started it."), M("How many witnesses?"),
      C("Enough to prove you really left. Then I stamp your passport."), M("My passport is completely empty."),
      C("Then let's give it a first page."), M("Everyone, if you know anyone who enjoys watching a man stand still — now is the time."),
    ],
    interstitials: [
      [M("Do witnesses need to do anything?"), C("Just be here. That's the whole job.")],
      [C("You could invite someone."), M("I'm new here. I only know the pigeons.")],
    ],
  },
  {
    id: "gift", atSec: 10 * 60, title: "A thank-you for Camille",
    lines: [
      C("I've fixed your route, taught you bonjour, and confiscated your postcards."), M("I should thank you properly."),
      C("You should."), M("Everyone, help. What do I give her?"),
    ],
    interstitials: [[M("What if nobody comes?"), C("Then I'll count twice.")]],
  },
  {
    id: "practice", atSec: 16 * 60, title: "Learning the way out",
    lines: [
      C("Show me how you'll leave. One step."), M("I can't. Nobody's pressed start."),
      C("You're not walking until six. I meant practice."), M("Practicing walking without walking. Very French."),
      C("It's called planning."),
    ],
    interstitials: [
      [C("Look both ways at crossings."), M("Both? That doubles the looking.")],
      [M(`How long is ${ROUTE_COUNTRIES} countries?`), C(`${ROUTE_COUNTRIES} days, if you keep moving.`)],
      [C("Which foot first?"), M("The confident one.")],
    ],
  },
  {
    id: "first-stop", atSec: 22 * 60, title: "The first real destination",
    lines: [
      C(`There. That's your first real stop. ${stop}.`), M("It's not a postcard of Paris?"),
      C("It's not even in France."), M(`${stop}. I like the sound of it. I'll learn how to say hello there.`),
      C(`And after that, ${ROUTE_COUNTRIES - 2} more.`), M("Don't tell me the rest. I want to be surprised."),
      C("You'll find out one country at a time. Like everyone else."),
    ],
    interstitials: [
      [M("Will they know I'm coming?"), C("They will if people keep watching.")],
      [C("Say hello in their language first."), M("And if I get it wrong?"), C("Wave. It worked here.")],
    ],
  },
  {
    id: "repacking", atSec: 30 * 60, title: "Repacking",
    lines: [
      C("Backpack. What's in it now?"), M("One water bottle, fourteen demoted postcards, and a direction."),
      C("Much better."), M("Also courage. It was on sale."), C("Keep the receipt."),
    ],
    interstitials: [
      [M("Is my backpack too heavy?"), C("Only the postcards.")],
      [C("Shoes tied?"), M("Emotionally, yes.")],
    ],
  },
  {
    id: "last-words", atSec: 34 * 60, title: "Last words in Paris",
    lines: [
      C("When you leave, people will remember your last words."), M("No pressure."), C("Some pressure."),
      M("Everyone, you've picked my name and my pose. Pick my last words too."),
    ],
    interstitials: [],
  },
  {
    id: "goodbye", atSec: 40 * 60, title: "Goodbye to the view",
    lines: [
      M("I've looked at this station for days."), C("Will you miss it?"), M("I'll miss standing still with an excuse."),
      C("You'll have better views by tomorrow."), M("Tell the pigeons it wasn't personal."), C("They'll understand. They're travelers too."),
    ],
    interstitials: [
      [C("Nervous?"), M("Only in my legs, my backpack, and my entire personality.")],
      [M("Will you watch me go?"), C("Somebody has to. That's how it works.")],
    ],
  },
  { id: "stamp", atSec: 50 * 60, title: "The stamp ceremony", lines: [], interstitials: [] },
  {
    id: "final-minutes", atSec: 55 * 60, title: "Final minutes",
    lines: [
      C("Five minutes. Stand where you'll start."), M("Here? Or slightly more heroically over there?"),
      C("Here is fine. Heroism is optional."), M("Everyone, stay. I only walk while you watch."),
    ],
    interstitials: [],
  },
];

const QUIET_CROWD = C("Quiet crowd. I'll pick this one.");
export const CAMILLE_DEFAULT_OPTION = 0;

/** The ceremony: the goal branch uses only the real, observed count. */
export function stampLines(witnesses: number | null, goal: number): EpisodeLine[] {
  const open = [C("It's time. Passport, please."), M("It's very empty. Please be gentle.")];
  const middle = witnesses !== null && witnesses >= goal
    ? [C(`${witnesses} witnesses. That's a real departure.`), M(`${witnesses} people watched me stand still. I'm so proud of us.`)]
    : [C("Not quite the tradition. But these people came. That counts."), M("Is that allowed?"), C("I invented the rule. I'm allowed to bend it.")];
  return [...open, ...middle, C("Official Paris stamp. Your first."), M("Page one. It's beautiful."), C("Thirteen more pages to fill.")];
}

export function finalLines(choices: RescueChoices): EpisodeLine[] {
  return [C("Allez. Go on. I'm watching too."), M(RESCUE_POLLS.lastWords.options[choices.lastWords ?? CAMILLE_DEFAULT_OPTION])];
}

const INTERSTITIAL_EVERY_SECONDS = 60;
const INTERSTITIAL_FIRST_AFTER_SECONDS = 35;

export function rescueTimeline(config: RouteRescueConfig, choices: RescueChoices, stampWitnesses: number | null): TimedLine[] {
  const startMs = Date.parse(config.episode2StartAt);
  const finalSec = (Date.parse(config.finalLinesAt) - startMs) / 1000;
  const stampSec = (Date.parse(config.stampCeremonyAt) - startMs) / 1000;
  const raw: TimedLine[] = [];
  RESCUE_SCENES.forEach((scene, index) => {
    const nextAt = RESCUE_SCENES[index + 1]?.atSec ?? finalSec;
    const lines = scene.id === "stamp" ? stampLines(stampWitnesses, config.witnessGoal) : scene.lines;
    let end = lay(raw, scene.id, scene.id === "stamp" ? stampSec : scene.atSec, lines);
    for (const poll of Object.values(RESCUE_POLLS)) {
      if (poll.opensAtSec !== scene.atSec) continue;
      const chosen = choices[poll.id];
      const result = poll.id === "gift" ? poll.results[chosen ?? CAMILLE_DEFAULT_OPTION] : poll.results[0];
      end = Math.max(end, lay(raw, `${poll.id}-result`, poll.closesAtSec, [...(chosen === undefined ? [QUIET_CROWD] : []), ...result]));
    }
    let slot = end + INTERSTITIAL_FIRST_AFTER_SECONDS;
    scene.interstitials.forEach((pair, k) => {
      const length = sequenceSeconds(pair);
      if (slot + length + 10 > nextAt) return;
      lay(raw, `${scene.id}-i${k}`, slot, pair);
      slot += Math.max(INTERSTITIAL_EVERY_SECONDS, length + 20);
    });
  });
  lay(raw, "final", finalSec, finalLines(choices));
  raw.sort((a, b) => a.startSec - b.startSec);
  const cutoff = (Date.parse(config.actualLaunchAt) - startMs) / 1000 - 5;
  const out: TimedLine[] = [];
  for (const line of raw) {
    const previous = out[out.length - 1];
    if (previous && line.startSec < previous.endSec) continue;
    if (line.startSec >= cutoff) continue;
    out.push({ ...line, endSec: Math.min(line.endSec, cutoff) });
  }
  return out;
}

/** A milestone reaction: which lines, by the milestone's place against the goal. */
export function milestoneReaction(threshold: number, config: RouteRescueConfig): EpisodeLine[] {
  if (threshold === config.milestones[0] && threshold < config.witnessGoal) {
    return [C("Look. Witnesses are arriving."), M("Hello, witnesses. Please look official.")];
  }
  if (threshold === config.witnessGoal) {
    return [C("That's enough witnesses for a real departure."), M("I'd like to thank everyone who stood here doing nothing with me.")];
  }
  if (threshold > config.witnessGoal) {
    return [M("More people? I'm going to have to walk very well."), C("Try not to trip in front of them.")];
  }
  return [M("Hello! You're officially a witness."), C("They're waving at you. Wave back."), M("Already doing it. Aggressively.")];
}

/**
 * Places a reaction at the first gap after `fromSec` where it fits whole, so it never talks
 * over the script. Returns nothing when no gap fits before the final lines.
 */
export function placeReaction(timeline: readonly TimedLine[], fromSec: number, lines: readonly EpisodeLine[], id: string, beforeSec: number): TimedLine[] {
  const length = sequenceSeconds(lines);
  let at = fromSec;
  for (const line of timeline) {
    if (line.endSec <= at) continue;
    if (line.startSec >= at + length + 1) break;
    at = line.endSec + 1;
  }
  if (at + length > beforeSec) return [];
  const out: TimedLine[] = [];
  lay(out, id, at, lines);
  return out;
}

export type WitnessCrossing = { threshold: number; atMs: number };

export type RescueView = {
  active: boolean;
  chapter: string | null;
  line: (EpisodeLine & { id: string }) | null;
  poll: (RescuePoll & { open: boolean; closesAtMs: number; choice: number | null }) | null;
  departsInMs: number;
  witnessesVisible: boolean;
  stampVisible: boolean;
  /** The final exchange is under way: Milo holds Episode 1's departure pose. */
  finalMoment: boolean;
};

export const RESCUE_OFF: RescueView = {
  active: false, chapter: null, line: null, poll: null, departsInMs: 0, witnessesVisible: false, stampVisible: false, finalMoment: false,
};

export function rescueViewAt(
  config: RouteRescueConfig,
  nowMs: number,
  launchStartsAt: string | null,
  choices: RescueChoices,
  witnesses: { stamp: number | null; crossings: readonly WitnessCrossing[] },
  enabled = true,
): RescueView {
  if (!enabled || !launchStartsAt || !Number.isFinite(nowMs)) return RESCUE_OFF;
  const launchMs = Date.parse(config.actualLaunchAt);
  if (Date.parse(launchStartsAt) !== launchMs || nowMs >= launchMs) return RESCUE_OFF;
  const startMs = Date.parse(config.episode2StartAt);
  const sec = (nowMs - startMs) / 1000;
  const firstAt = RESCUE_SCENES[0].atSec;
  if (sec < firstAt) return RESCUE_OFF;
  let chapter = RESCUE_SCENES[0].title;
  for (const scene of RESCUE_SCENES) if (scene.atSec <= sec) chapter = scene.title;
  const finalSec = (Date.parse(config.finalLinesAt) - startMs) / 1000;
  const timeline = rescueTimeline(config, choices, witnesses.stamp);
  const reactions = witnesses.crossings.flatMap((crossing) => placeReaction(
    timeline, (crossing.atMs - startMs) / 1000, milestoneReaction(crossing.threshold, config), `milestone-${crossing.threshold}`, finalSec,
  ));
  const all = [...timeline, ...reactions];
  const current = all.find((entry) => entry.startSec <= sec && sec < entry.endSec);
  let poll: RescueView["poll"] = null;
  for (const candidate of Object.values(RESCUE_POLLS)) {
    if (sec >= candidate.opensAtSec && sec < candidate.closesAtSec + 4 * 60) {
      poll = { ...candidate, open: sec < candidate.closesAtSec, closesAtMs: startMs + candidate.closesAtSec * 1000, choice: choices[candidate.id] ?? null };
    }
  }
  return {
    active: true,
    chapter,
    line: current ? { speaker: current.speaker, text: current.text, id: current.id } : null,
    poll,
    departsInMs: launchMs - nowMs,
    witnessesVisible: sec >= 6 * 60,
    stampVisible: nowMs >= Date.parse(config.stampCeremonyAt),
    finalMoment: sec >= finalSec,
  };
}

/**
 * Milestones newly crossed when the observed peak rises from `previous` to `next`. The first
 * reading (`previous` null) crosses nothing: milestones already behind a late arrival never fire.
 */
export function newlyCrossed(milestones: readonly number[], previous: number | null, next: number): number[] {
  if (previous === null) return [];
  return milestones.filter((threshold) => previous < threshold && next >= threshold);
}

export function witnessShareText(config: RouteRescueConfig): string {
  const date = new Date(config.actualLaunchAt);
  const departs = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
  return `Milo can't leave Paris without witnesses. I'm one. He departs at ${departs}. Come be another 👀`;
}

export { lineSeconds };
