import type { ConnectionStatus } from "@/lib/contracts";

export type WalkingStatusInput = {
  journeyState: "prelaunch" | "live" | "intermission" | "completed";
  mode: "live" | "prelaunch" | "offline_preview";
  startsIn: string | null;
  wakeCountdown: number | null;
  /** This browser's confirmed walking lease is current. */
  walking: boolean;
  /** The label of the stop he is performing, if any. */
  actionLabel: string | null;
  /** The place the world actually drew; null while a painting is still loading. */
  renderedPlaceLabel: string | null;
  weatherFragment?: string | null;
  connection: ConnectionStatus;
  /** The newest authority this browser holds said he was walking. */
  lastConfirmedWalking: boolean;
  /** The server confirmed nobody is watching, and since when (local time). */
  waitingSinceLocalTime: string | null;
  sleeping: boolean;
  /** This browser is live but has not had its own presence confirmed yet. */
  joining?: boolean;
};

export type WalkingStatus = {
  text: string;
  tone: "walking" | "stopped" | "waiting" | "reconnecting" | "preview" | "prelaunch";
};

/**
 * The one status line. It names exactly the state on screen, and it separates
 * this browser losing touch with the server ("Reconnecting…") from the server
 * confirming that nobody is watching ("Waiting for the internet").
 */
export function walkingStatusLabel(input: WalkingStatusInput): WalkingStatus {
  if (input.journeyState === "prelaunch") return { text: `Starts ${input.startsIn ?? "soon"}`, tone: "prelaunch" };
  if (input.mode === "offline_preview") return { text: "Preview only · waiting for the live journey", tone: "preview" };
  if (input.wakeCountdown) {
    return { text: `Waking up · starts walking in ${input.wakeCountdown}…`, tone: "waiting" };
  }
  if (input.walking) {
    if (input.actionLabel) return { text: input.actionLabel, tone: "stopped" };
    const weather = input.weatherFragment ? ` ${input.weatherFragment}` : "";
    return {
      text: input.renderedPlaceLabel ? `Walking${weather} · ${input.renderedPlaceLabel}` : `Walking${weather}`,
      tone: "walking",
    };
  }
  if (input.connection === "offline") return { text: "You're offline · reconnecting when you're back", tone: "reconnecting" };
  // Before this visitor's first heartbeat nothing about them is known yet: they
  // are neither reconnecting nor proof of an empty audience.
  if (input.joining) return { text: "Joining the walk…", tone: "reconnecting" };
  // The last word from the server was "walking" but it has not been renewed: that
  // is this browser's connection, not an empty audience.
  if (input.connection === "reconnecting" || (input.lastConfirmedWalking && !input.waitingSinceLocalTime)) {
    return { text: "Reconnecting…", tone: "reconnecting" };
  }
  if (input.waitingSinceLocalTime) {
    return {
      text: input.sleeping
        ? `Asleep · since ${input.waitingSinceLocalTime}`
        : `Waiting for the internet · since ${input.waitingSinceLocalTime}`,
      tone: "waiting",
    };
  }
  return { text: "Waiting for the internet", tone: "waiting" };
}
