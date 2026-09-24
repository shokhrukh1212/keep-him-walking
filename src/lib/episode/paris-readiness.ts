/**
 * "Fourteen postcards, one city": a one-off, one-hour prelaunch story in Paris.
 *
 * Everything here is a pure function of the configured timestamps, the server-synchronized
 * wall clock and this browser's own choices, so a refresh, a remount or a tab coming back
 * lands on the same line everyone else is reading. Nothing is queued while a tab is hidden.
 *
 * The episode never moves the launch. It is shown only while the server's authoritative
 * start equals `actualLaunchAt`; any other start (not yet rescheduled, or moved again)
 * turns the whole episode off so the page can never advertise one departure and plan another.
 *
 * The polls are the individual-choice fallback: each visitor's pick is theirs alone, kept in
 * this browser, labelled "Your choice", and never counted or presented as a community result.
 *
 * To add the 17:00–18:00 story, add a second config and scenes list with its own window and
 * render it the same way; nothing here starts automatically after `episodeEndAt`.
 */

export type EpisodeConfig = {
  id: string;
  episodeStartAt: string;
  episodeEndAt: string;
  preparationRevealAt: string;
  actualLaunchAt: string;
};

export const PARIS_READINESS_EPISODE: EpisodeConfig = {
  id: "paris-readiness-2026-09-24",
  episodeStartAt: "2026-09-24T16:00:00Z",
  episodeEndAt: "2026-09-24T17:00:00Z",
  preparationRevealAt: "2026-09-24T16:50:00Z",
  actualLaunchAt: "2026-09-24T18:00:00Z",
};

export type Speaker = "milo" | "camille";
export type EpisodeLine = { speaker: Speaker; text: string };
type Pair = EpisodeLine[];

export type PollId = "intro" | "pose";
export type EpisodeChoices = {
  intro?: number;
  pose?: number;
  /** Wall-clock ms of this browser's accepted "Help Milo get ready". */
  helpedAtMs?: number;
};

export type EpisodePoll = {
  id: PollId;
  question: string;
  options: readonly string[];
  opensAtSec: number;
  closesAtSec: number;
  results: readonly Pair[];
};

const M = (text: string): EpisodeLine => ({ speaker: "milo", text });
const C = (text: string): EpisodeLine => ({ speaker: "camille", text });

export const EPISODE_POLLS: Record<PollId, EpisodePoll> = {
  intro: {
    id: "intro",
    question: "How should Milo introduce himself?",
    options: ["Confident", "Honest", "Ask for help"],
    opensAtSec: 6 * 60,
    closesAtSec: 8 * 60,
    results: [
      [M("Milo. International traveler. Currently operating at zero kilometers."), C("Excellent. Plenty of room for improvement.")],
      [M("The internet named me. Now it's responsible for my exercise."), C("At least someone is taking responsibility.")],
      [M("Could you explain the world before departure?"), C("We'll start with the first street.")],
    ],
  },
  pose: {
    id: "pose",
    question: "Choose Milo's official departure pose.",
    options: ["Wave", "Serious", "Photo-ready"],
    opensAtSec: 24 * 60,
    closesAtSec: 26 * 60,
    results: [
      [M("Approachable. International. Excellent wrist work."), C("Hold that.")],
      [M("I'm thinking about borders."), C("You look like you forgot your password.")],
      [M("Use the angle that suggests I know where I'm going."), C("That's quite an angle.")],
    ],
  },
};

type Scene = {
  id: string;
  atSec: number;
  /** Visitor-facing chapter name. Never gives away the postcards before 16:45. */
  title: string;
  lines: EpisodeLine[];
  interstitials: Pair[];
};

export const EPISODE_SCENES: Scene[] = [
  {
    id: "arrives", atSec: 0, title: "Camille arrives",
    lines: [
      C("You've been standing here for a while. Waiting for someone?"), M("Technically, everyone."),
      C("Everyone?"), M("I only walk while somebody watches."),
      C("Fourteen countries, and you need supervision to cross the pavement?"), M("I prefer ‘community-supported navigation’."),
      C("I'm Camille. Let's find out whether you're ready."), M("Everyone, please make me look organized."),
    ],
    interstitials: [
      [C("Do you have a plan?"), M("Fourteen destinations. Very photogenic.")],
      [M("Is looking prepared enough?"), C("Only for the photograph.")],
      [C("Your backpack is enormous."), M("Mostly ambition.")],
    ],
  },
  {
    id: "intro-choice", atSec: 6 * 60, title: "First audience choice",
    lines: [C("Before we discuss the world, introduce yourself."), M("I delegated my personality to the audience."), C("Of course you did.")],
    interstitials: [],
  },
  {
    id: "supplies", atSec: 12 * 60, title: "Supplies inspection",
    lines: [
      C("What did you pack?"), M("Confidence."), C("Anything useful?"), M("A spare confidence."),
      C("Water?"), M("There's a button for that."), C("You have outsourced survival."), M("It's a very supportive website."),
    ],
    interstitials: [
      [M("Should I pack a second pair of shoes?"), C("Start with a direction.")],
      [C("Snacks?"), M("I was hoping the countries would provide those.")],
      [M("My packing strategy is optimistic."), C("That is one word for it.")],
    ],
  },
  {
    id: "hello", atSec: 18 * 60, title: "A lesson in saying hello",
    lines: [
      C("When you meet someone, you can start with bonjour."), M("Bonjour."), C("Good."),
      M("How do I say ‘please supervise my walking’?"), C("Perhaps save that for the second conversation."),
      M("I'm trying to make a memorable first impression."), C("That part is working."),
    ],
    interstitials: [
      [M("Do I wave at everyone?"), C("Try one person at a time.")],
      [C("You look less nervous."), M("The audience is doing most of the confidence.")],
      [M("What if I forget the words?"), C("A friendly wave still works.")],
    ],
  },
  {
    id: "pose-choice", atSec: 24 * 60, title: "The departure pose",
    lines: [C("You need a photograph before you leave."), M("My experienced-traveler expression isn't finished."), C("Let the audience choose.")],
    interstitials: [],
  },
  {
    id: "itinerary", atSec: 30 * 60, title: "The itinerary looks impressive",
    lines: [
      C("Have you checked the itinerary?"), M("Every page. Beautiful views."), C("Routes, names, connections?"),
      M("Excellent lighting."), C("That wasn't quite my question."), M("I have a very visual planning style."),
      C("We'll take a proper look in a moment."),
    ],
    interstitials: [
      [M("Some of the destinations look reassuringly familiar."), C("How familiar?"), M("Comfortably familiar.")],
      [C("Which direction first?"), M("The scenic one.")],
      [M("I arranged the pages by beauty."), C("Geography may have opinions.")],
    ],
  },
  {
    id: "quiet", atSec: 36 * 60, title: "A quieter moment",
    lines: [
      C("Why fourteen countries?"), M("I wanted a story longer than this pavement."),
      C("And what do you want to bring back?"), M("Something to tell everyone who showed up."),
      C("That's a better answer."), M("I can do sincere. Briefly."), C("Keep that part of the packing."),
    ],
    interstitials: [
      [M("Do travelers get nervous?"), C("The sensible ones do.")],
      [C("You don't need to see everything today."), M("Just something worth coming back for.")],
      [M("Will people return tomorrow?"), C("Give them a story worth checking on.")],
    ],
  },
  {
    id: "final-check", atSec: 42 * 60, title: "The final check begins",
    lines: [
      C("All right. Let me see those fourteen destinations."), M("Please admire the composition."),
      C("Day one. Paris."), M("Strong opening."), C("Day two…"), M("Another strong photograph."),
      C("Milo. What exactly did you download?"),
    ],
    interstitials: [[M("Why are you making that face?"), C("I'm checking a theory.")]],
  },
  {
    id: "reveal", atSec: 45 * 60, title: "A discovery",
    lines: [
      C("These are fourteen postcards."), M("One for each country."), C("They're all Paris."), M("Paris has range."),
      C("You packed a slideshow, not an itinerary."), M("That explains why the Eiffel Tower kept following me."),
      C("We need a route. Luckily, we have the preparation hour before six."), M("Can we keep the photographs?"),
      C("Yes. We're fixing your directions, not your memories."),
    ],
    interstitials: [],
  },
  {
    id: "encouragement", atSec: 50 * 60, title: "Route rescue next",
    lines: [
      C("We'll use the next hour to get you properly ready."), M("Everyone just watched me confuse postcards with geography."),
      C("And they're still welcome to help."), M("Could I borrow a little confidence?"),
    ],
    interstitials: [],
  },
  {
    id: "photo", atSec: 56 * 60, title: "One last photograph",
    lines: [
      C("One photograph before we sort this out?"), M("For the documentary about my preparation?"),
      C("For everyone who was here before your first step."), M("Use the good angle. The one without the itinerary."),
      C("Next job: find the way out of Paris."), M("Does this map have a ‘you are here’?"), C("Milo…"),
    ],
    interstitials: [],
  },
];

const CLOSING: EpisodeLine[] = [C("Come on. Let's get the real plan ready."), M("I'll be ready for six. With considerably better directions.")];
const NO_HELP_LINE = C("One street at a time. We'll work it out.");
const QUIET_CROWD = C("Quiet crowd. I'll pick this one.");
export const HELP_THANKS = M("Thank you. Keeping the confidence. Replacing the itinerary.");
/** Camille's fixed pick when this visitor made none: the first option, in fixed order. */
export const CAMILLE_DEFAULT_OPTION = 0;

const GAP_SECONDS = 0.8;
const INTERSTITIAL_EVERY_SECONDS = 60;
const INTERSTITIAL_FIRST_AFTER_SECONDS = 35;
const HELP_THANKS_SECONDS = 6;

/** About 5–8 seconds a line, longer for longer lines. */
export function lineSeconds(text: string): number {
  return Math.min(8, Math.max(5, 3.5 + text.length / 18));
}

export type TimedLine = EpisodeLine & { id: string; startSec: number; endSec: number };

export function lay(out: TimedLine[], id: string, startSec: number, lines: readonly EpisodeLine[]): number {
  let at = startSec;
  lines.forEach((line, index) => {
    const duration = lineSeconds(line.text);
    out.push({ ...line, id: `${id}-${index}`, startSec: at, endSec: at + duration });
    at += duration + GAP_SECONDS;
  });
  return at;
}

export function sequenceSeconds(lines: readonly EpisodeLine[]): number {
  return lines.reduce((sum, line) => sum + lineSeconds(line.text) + GAP_SECONDS, 0);
}

/** Every line of the hour, in seconds from the episode start, never overlapping. */
export function episodeTimeline(config: EpisodeConfig, choices: EpisodeChoices): TimedLine[] {
  const startMs = Date.parse(config.episodeStartAt);
  const totalSec = (Date.parse(config.episodeEndAt) - startMs) / 1000;
  const helpedSec = choices.helpedAtMs === undefined ? null : (choices.helpedAtMs - startMs) / 1000;
  const raw: TimedLine[] = [];
  EPISODE_SCENES.forEach((scene, index) => {
    const nextAt = EPISODE_SCENES[index + 1]?.atSec ?? totalSec;
    let end = lay(raw, scene.id, scene.atSec, scene.lines);
    const blocks: { id: string; lines: EpisodeLine[] }[] = [];
    for (const poll of Object.values(EPISODE_POLLS)) {
      if (poll.opensAtSec !== scene.atSec) continue;
      const chosen = choices[poll.id];
      const option = chosen ?? CAMILLE_DEFAULT_OPTION;
      const lines = [...(chosen === undefined ? [QUIET_CROWD] : []), ...poll.results[option]];
      if (poll.id === "intro") lines.push(C("Fine. We can work with that."), M("Put that on my travel résumé."));
      end = Math.max(end, lay(raw, `${poll.id}-result`, poll.closesAtSec, lines));
    }
    if (scene.id === "encouragement" && (helpedSec === null || helpedSec > 53 * 60)) {
      blocks.push({ id: "no-help", lines: [NO_HELP_LINE] });
    }
    scene.interstitials.forEach((pair, k) => blocks.push({ id: `${scene.id}-i${k}`, lines: pair }));
    let slot = scene.id === "encouragement" ? Math.max(end + 10, 53 * 60) : end + INTERSTITIAL_FIRST_AFTER_SECONDS;
    for (const block of blocks) {
      const length = sequenceSeconds(block.lines);
      if (slot + length + 10 > nextAt) break;
      lay(raw, block.id, slot, block.lines);
      slot += Math.max(INTERSTITIAL_EVERY_SECONDS, length + 20);
    }
  });
  lay(raw, "closing", totalSec - sequenceSeconds(CLOSING), CLOSING);
  raw.sort((a, b) => a.startSec - b.startSec);
  // Never two speakers at once, and nothing after the cutoff.
  const out: TimedLine[] = [];
  for (const line of raw) {
    const previous = out[out.length - 1];
    if (previous && line.startSec < previous.endSec) continue;
    if (line.startSec >= totalSec) continue;
    out.push({ ...line, endSec: Math.min(line.endSec, totalSec) });
  }
  return out;
}

export type EpisodePhase = "off" | "before" | "live" | "reveal" | "ended";

export type EpisodeView = {
  phase: EpisodePhase;
  chapter: string | null;
  line: (EpisodeLine & { id: string }) | null;
  poll: (EpisodePoll & { open: boolean; closesAtMs: number; choice: number | null; resultShown: boolean }) | null;
  /** Milliseconds until the episode (not the journey) ends, while it runs. */
  episodeEndsInMs: number | null;
  helpVisible: boolean;
  shareVisible: boolean;
};

const OFF: EpisodeView = {
  phase: "off", chapter: null, line: null, poll: null, episodeEndsInMs: null, helpVisible: false, shareVisible: false,
};

/**
 * What the episode shows at `nowMs`. `launchStartsAt` is the server's authoritative start;
 * the episode exists only while it equals the configured departure and has not arrived.
 */
export function episodeViewAt(
  config: EpisodeConfig,
  nowMs: number,
  launchStartsAt: string | null,
  choices: EpisodeChoices,
  enabled = true,
): EpisodeView {
  if (!enabled || !launchStartsAt || !Number.isFinite(nowMs)) return OFF;
  // The owner moves the start from 17:00 to 18:00 near the end of the story. Until then the
  // page names the server's start as it is; a start that would cut into the hour turns it off.
  const launchMs = Date.parse(launchStartsAt);
  if (!Number.isFinite(launchMs) || launchMs < Date.parse(config.episodeEndAt) || nowMs >= launchMs) return OFF;
  const startMs = Date.parse(config.episodeStartAt);
  const endMs = Date.parse(config.episodeEndAt);
  const revealMs = Date.parse(config.preparationRevealAt);
  if (nowMs < startMs) return { ...OFF, phase: "before" };
  if (nowMs >= endMs) return { ...OFF, phase: "ended" };
  const sec = (nowMs - startMs) / 1000;
  let chapter = EPISODE_SCENES[0].title;
  for (const scene of EPISODE_SCENES) if (scene.atSec <= sec) chapter = scene.title;

  let line: EpisodeView["line"] = null;
  const helpedSec = choices.helpedAtMs === undefined ? null : (choices.helpedAtMs - startMs) / 1000;
  if (helpedSec !== null && sec >= helpedSec && sec < helpedSec + HELP_THANKS_SECONDS) {
    line = { ...HELP_THANKS, id: "help-thanks" };
  } else {
    const current = episodeTimeline(config, choices).find((entry) => entry.startSec <= sec && sec < entry.endSec);
    if (current) line = { speaker: current.speaker, text: current.text, id: current.id };
  }

  let poll: EpisodeView["poll"] = null;
  for (const candidate of Object.values(EPISODE_POLLS)) {
    // A poll is on screen while it is open and through its result, until the next chapter.
    if (sec >= candidate.opensAtSec && sec < candidate.closesAtSec + 4 * 60) {
      const chosen = choices[candidate.id];
      poll = {
        ...candidate,
        open: sec < candidate.closesAtSec,
        closesAtMs: startMs + candidate.closesAtSec * 1000,
        choice: chosen ?? null,
        resultShown: sec >= candidate.closesAtSec,
      };
    }
  }
  const phase: EpisodePhase = nowMs >= revealMs ? "reveal" : "live";
  return {
    phase,
    chapter,
    line,
    poll,
    episodeEndsInMs: endMs - nowMs,
    helpVisible: phase === "reveal",
    shareVisible: sec >= 56 * 60 + 30,
  };
}

/** "18:00 UTC" for any instant. */
export function utcClock(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export function countdownText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function episodeShareText(config: EpisodeConfig): string {
  return `Milo planned fourteen countries and packed fourteen postcards of Paris. I'm here for the preparation chaos. Departure: ${utcClock(config.actualLaunchAt)}.`;
}
