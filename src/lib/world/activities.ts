import { CLIP_DURATIONS, type CharacterClip, type ResidentType } from "@/lib/characters/manifest";
import type { ConversationScript, CountryPack, DialogueLine, TravelerState } from "@/lib/content/schema";

/**
 * Everything that stops his walk. Each one is a server-owned window in
 * `scheduled_actions`, so distance and the road pause for exactly its length and
 * every viewer, late joiner and reconnect sees the same moment.
 */

/** What the crowd can ask for. `water` reactions are recorded as `drink`. */
export const CROWD_ACTIVITY_KINDS = ["wave", "drink", "photo"] as const;
export type CrowdActivityKind = (typeof CROWD_ACTIVITY_KINDS)[number];

/** The two autonomous actions requested for the 4–6 minute cadence. */
export const OWN_ACTION_KINDS = ["drink", "photo"] as const;
export type OwnActionKind = (typeof OWN_ACTION_KINDS)[number];

export const ACTIVITY_KINDS = [
  "wave", "drink", "photo", "phone", "look_around", "stretch", "tie_shoe", "yawn", "lean", "laugh",
  "stumble", "cheer", "conversation", "greeting",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type SoloActivityKind = Exclude<ActivityKind, "conversation" | "greeting">;

export const ACTIVITY_SOURCES = ["crowd", "beat", "system"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === "string" && (ACTIVITY_KINDS as readonly string[]).includes(value);
}

export function isCrowdActivityKind(value: unknown): value is CrowdActivityKind {
  return typeof value === "string" && (CROWD_ACTIVITY_KINDS as readonly string[]).includes(value);
}

/** He steps out of the walk with this take before any stop, at its own length. */
export const STOP_ENTRY_CLIP: CharacterClip = "walk_stop";
export const STOP_ENTRY_SECONDS = CLIP_DURATIONS[STOP_ENTRY_CLIP];

/** The approved take each solo stop plays, whole and at its recorded speed. */
export const ACTION_CLIPS: Record<SoloActivityKind, CharacterClip> = {
  wave: "greet",
  drink: "drink",
  photo: "photo",
  phone: "phone",
  look_around: "look_up",
  stretch: "wait_stretch",
  tie_shoe: "tie_shoe",
  yawn: "wait_yawn",
  lean: "rest",
  laugh: "react",
  stumble: "stumble",
  cheer: "cheer",
};

/** The semantic state the status line names for each solo stop. */
export const ACTION_STATES: Record<SoloActivityKind, TravelerState> = {
  wave: "wave",
  drink: "drink",
  photo: "photo",
  phone: "phone",
  look_around: "look_up",
  stretch: "stretch",
  tie_shoe: "tie_shoe",
  yawn: "yawn",
  lean: "rest",
  laugh: "react",
  stumble: "stumble",
  cheer: "cheer",
};

const round3 = (value: number) => Math.round(value * 1_000) / 1_000;

/** Stop entry plus the whole take. Nothing is squeezed to fit a slot. */
export function actionDurationSeconds(kind: SoloActivityKind): number {
  return round3(STOP_ENTRY_SECONDS + CLIP_DURATIONS[ACTION_CLIPS[kind]]);
}

/**
 * Mirrors `crowd_action_duration_seconds` in migration 0036. A unit test reads the
 * migration and fails if the two ever disagree.
 */
export const CROWD_ACTION_DURATION_SECONDS: Record<CrowdActivityKind, number> = {
  wave: actionDurationSeconds("wave"),
  drink: actionDurationSeconds("drink"),
  photo: actionDurationSeconds("photo"),
};

/** A resident approaches, each person greets in turn, lines alternate, then the resident leaves. */
export type ConversationPhase =
  | "notice"
  | "stop"
  | "approach"
  | "greet_traveler"
  | "greet_resident"
  | "talk"
  | "listen"
  | "goodbye_traveler"
  | "goodbye_resident"
  | "depart";

export type ConversationSegment = {
  phase: ConversationPhase;
  start: number;
  duration: number;
  lineIndex?: number;
};

export const DEFAULT_LINE_SECONDS = 4.5;
export const RESIDENT_APPROACH_SECONDS = 2.8;
export const RESIDENT_DEPART_SECONDS = 2.8;
export const CONVERSATION_APPROACH_SECONDS = round3(
  CLIP_DURATIONS.notice + STOP_ENTRY_SECONDS + RESIDENT_APPROACH_SECONDS,
);

/**
 * Natural-length choreography. The first two authored lines are the reciprocal
 * greeting: only their speaker waves, while the other person listens. The line
 * remains visible for the entire unsqueezed greeting take. A wordless greeting
 * uses the same two sequential waves without inventing dialogue.
 */
export function conversationSegments(lines: readonly DialogueLine[]): ConversationSegment[] {
  const segments: ConversationSegment[] = [];
  let cursor = 0;
  const push = (phase: ConversationPhase, duration: number, lineIndex?: number) => {
    segments.push({ phase, start: round3(cursor), duration, ...(lineIndex === undefined ? {} : { lineIndex }) });
    cursor += duration;
  };
  push("notice", CLIP_DURATIONS.notice);
  push("stop", STOP_ENTRY_SECONDS);
  push("approach", RESIDENT_APPROACH_SECONDS);
  if (lines.length === 0) {
    push("greet_resident", CLIP_DURATIONS.greet);
    push("greet_traveler", CLIP_DURATIONS.greet);
    push("depart", RESIDENT_DEPART_SECONDS);
    return segments;
  }
  lines.forEach((line, index) => {
    const lineSeconds = (line.durationMs ?? DEFAULT_LINE_SECONDS * 1_000) / 1_000;
    if (index < 2) {
      push(
        line.speaker === "traveler" ? "greet_traveler" : "greet_resident",
        Math.max(CLIP_DURATIONS.greet, lineSeconds),
        index,
      );
    } else {
      push(line.speaker === "traveler" ? "talk" : "listen", lineSeconds, index);
    }
  });
  push("goodbye_resident", CLIP_DURATIONS.goodbye);
  push("goodbye_traveler", CLIP_DURATIONS.goodbye);
  push("depart", RESIDENT_DEPART_SECONDS);
  return segments;
}

export function conversationDurationSeconds(lines: readonly DialogueLine[]): number {
  return round3(conversationSegments(lines).reduce((total, segment) => total + segment.duration, 0));
}

export function conversationReviewIsUsable(review: ConversationScript["review"]): boolean {
  return review === "approved" || review === "creator_reviewed";
}

/** Only reviewed scripts. Pending words must never reach a live schedule or transcript. */
export function conversationScripts(pack: CountryPack): ConversationScript[] {
  if (pack.schemaVersion === 3 && pack.conversations.length > 0) {
    return pack.conversations.filter((script) => conversationReviewIsUsable(script.review));
  }
  const encounter = pack.encounters[0];
  if (!encounter) return [];
  const reviewed = pack.schemaVersion === 3
    && (pack.culturalReview.status === "approved" || pack.culturalReview.status === "creator_reviewed");
  if (!reviewed) return [];
  return [{
    id: encounter.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "story",
    placeTags: [],
    role: "story",
    review: pack.culturalReview.status === "approved" ? "approved" : "creator_reviewed",
    lines: encounter.lines.slice(0, 8),
  }];
}

export function conversationScript(pack: CountryPack, id: string | null | undefined): ConversationScript | null {
  if (!id) return null;
  return conversationScripts(pack).find((script) => script.id === id) ?? null;
}

export function packBaseResident(pack: CountryPack): ResidentType {
  return pack.schemaVersion === 3 ? pack.npcSystem.baseType : "resident-a";
}

export function conversationResident(pack: CountryPack, script: ConversationScript | null): ResidentType {
  return script?.residentType ?? packBaseResident(pack);
}

export function conversationSpeakerName(pack: CountryPack, script: ConversationScript | null): string {
  if (script?.speakerName) return script.speakerName;
  return pack.schemaVersion === 3 ? pack.resident.name : "a local resident";
}

const SOLO_LABELS: Record<SoloActivityKind, string> = {
  wave: "Waving back",
  drink: "Taking a drink",
  photo: "Taking a photo",
  phone: "Checking the route",
  look_around: "Looking around",
  stretch: "Stretching",
  tie_shoe: "Tying a shoe",
  yawn: "Yawning",
  lean: "Taking a breather",
  laugh: "Laughing to himself",
  stumble: "Stumbling, then finding his feet",
  cheer: "Celebrating a marathon",
};

/** What the status line says. It always names the state he is actually in. */
export function activityLabel(
  kind: ActivityKind,
  source: ActivitySource,
  speakerName?: string,
): string {
  if (kind === "conversation") return `Talking with ${speakerName ?? "a local resident"}`;
  if (kind === "greeting") return "Saying hello";
  if (kind === "wave" && source !== "crowd") return "Waving hello";
  return SOLO_LABELS[kind];
}

/** Anything with a watched-second window. */
export type ActivityWindowRow = {
  kind: string;
  atActiveSecond: number;
  endsAtActiveSecond?: number;
  cancelled?: boolean;
};

/** The server window of a live row, or null for a cancelled or malformed one. */
export function activityWindow(row: ActivityWindowRow): readonly [number, number] | null {
  if (row.cancelled) return null;
  const start = Number(row.atActiveSecond);
  if (!Number.isFinite(start)) return null;
  const fallback = isCrowdActivityKind(row.kind) ? CROWD_ACTION_DURATION_SECONDS[row.kind] : null;
  const end = Number.isFinite(row.endsAtActiveSecond) ? Number(row.endsAtActiveSecond) : fallback === null ? Number.NaN : start + fallback;
  if (!Number.isFinite(end) || end <= start) return null;
  return [Math.max(0, start), end] as const;
}
