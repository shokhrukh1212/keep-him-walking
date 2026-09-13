import { useCallback, useEffect, useRef, useState } from "react";
import {
  REACTION_COOLDOWN_SECONDS,
  REACTION_KINDS,
  REACTION_MOTION_KIND,
  reactionThreshold,
  type ReactionKind,
} from "@/lib/reactions/threshold";
import { newCrowdBooking, reactionRestSeconds } from "@/lib/reactions/rest";
import type { CrowdActionKind } from "@/lib/traveler/motion-clock";
import type { ReactionCounts, ReactionsView, ScheduledActionView } from "@/lib/contracts";

const REACTION_LABELS: Record<ReactionKind, { glyph: string; label: string; asked: string; rested: string }> = {
  wave: { glyph: "👋", label: "Wave", asked: "a wave", rested: "He just waved" },
  water: { glyph: "💧", label: "Water", asked: "water", rested: "He just had water" },
  photo: { glyph: "📷", label: "Photo", asked: "a photo", rested: "He just took a photo" },
};

const NO_STOPS: readonly ScheduledActionView[] = [];

type Props = {
  counts: ReactionCounts;
  activeViewers: number | null;
  /** False in offline preview, where nothing can be sent. */
  enabled: boolean;
  /** The crowd action he is performing right now, if any. */
  activeCrowdKind: CrowdActionKind | null;
  /** Server-owned stops. After a crowd action its reaction rests for 120 watched seconds. */
  scheduled?: readonly ScheduledActionView[];
  /** The watched second he is at now, from the bounded presentation clock. */
  activeSeconds?: number;
  onScheduled?: (kind: ReactionKind, atActiveSecond: number) => void;
  /** The server's reaction board, returned with the answer to a request. */
  onReactions?: (reactions: ReactionsView) => void;
  /** An accepted request; `booked` is true when it completed the crowd and he will act. */
  onConfirmed?: (booked: boolean) => void;
  /** Reads the board again. An unanswered request may still have arrived, so it is checked. */
  reconcile?: () => Promise<ReactionsView | null>;
};

type CooldownMap = Partial<Record<ReactionKind, number>>;
type Feedback = {
  kind: ReactionKind;
  phase:
    | "sending"
    | "checking"
    | "contributing"
    | "queued"
    | "executing"
    | "cooldown"
    | "asked"
    | "limited"
    | "resting"
    | "not_watching"
    | "failed";
  count?: number;
  threshold?: number;
  expiresAtMs?: number;
};

type Answer = {
  reason?: string | null;
  count?: number;
  threshold?: number;
  scheduledAt?: number | null;
  retryAfterSeconds?: number | null;
  requestExpiresAt?: string;
  cooldownSeconds?: number;
  reactions?: ReactionsView;
};

export function ReactionButtons({
  counts,
  activeViewers,
  enabled,
  activeCrowdKind,
  scheduled = NO_STOPS,
  activeSeconds = Number.NaN,
  onScheduled,
  onReactions,
  onConfirmed,
  reconcile,
}: Props) {
  const [cooldowns, setCooldowns] = useState<CooldownMap>({});
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<ReactionKind | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const previousCrowdKind = useRef<CrowdActionKind | null>(null);
  // The stops known when a request leaves, to recognise its booking if the answer is lost.
  const knownStops = useRef(scheduled);
  useEffect(() => {
    knownStops.current = scheduled;
  }, [scheduled]);

  // One shared ticker drives every countdown, so the buttons stay honest about
  // how long is left without a timer per button.
  useEffect(() => {
    if (Object.keys(cooldowns).length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [cooldowns]);

  useEffect(() => {
    const previous = previousCrowdKind.current;
    previousCrowdKind.current = activeCrowdKind;
    if (activeCrowdKind !== null && previous !== activeCrowdKind) {
      const kind = activeCrowdKind === "drink" ? "water" : activeCrowdKind;
      setFeedback({ kind, phase: "executing" });
    } else if (activeCrowdKind === null && previous !== null) {
      const kind = previous === "drink" ? "water" : previous;
      setFeedback({ kind, phase: "cooldown" });
    }
  }, [activeCrowdKind]);

  const send = useCallback(async (kind: ReactionKind) => {
    const before = knownStops.current;
    const startCooldown = (seconds: number) => {
      const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : REACTION_COOLDOWN_SECONDS;
      setCooldowns((current) => ({ ...current, [kind]: Date.now() + safe * 1_000 }));
    };
    // No answer is not a refusal: the server may have booked it before the reply was lost.
    const checkUnanswered = async () => {
      setFeedback({ kind, phase: "checking" });
      const board = reconcile ? await reconcile().catch(() => null) : null;
      const booked = board ? newCrowdBooking(kind, before, board.scheduled) : null;
      if (booked === null) {
        setFeedback({ kind, phase: "failed" });
        return;
      }
      startCooldown(REACTION_COOLDOWN_SECONDS);
      onScheduled?.(kind, booked);
      setFeedback({ kind, phase: "queued" });
      onConfirmed?.(true);
    };
    setPending(kind);
    setFeedback({ kind, phase: "sending" });
    try {
      const response = await fetch("/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!response) {
        await checkUnanswered();
        return;
      }
      const result = await response.json().catch(() => null) as Answer | null;
      if (result?.reactions) onReactions?.(result.reactions);
      if (response.ok) {
        startCooldown(Number(result?.cooldownSeconds ?? REACTION_COOLDOWN_SECONDS));
        const scheduledAt = result?.scheduledAt;
        const booked = typeof scheduledAt === "number";
        if (booked) {
          onScheduled?.(kind, scheduledAt);
          setFeedback({ kind, phase: "queued" });
        } else {
          setFeedback({
            kind,
            phase: "contributing",
            count: Number(result?.count ?? counts[kind]),
            threshold: Number(result?.threshold ?? reactionThreshold(activeViewers ?? 0)),
            expiresAtMs: Date.parse(String(result?.requestExpiresAt ?? "")),
          });
        }
        // A server that answers without the board is still read back.
        if (!result?.reactions) void reconcile?.();
        onConfirmed?.(booked);
        return;
      }
      if (response.status === 429) {
        startCooldown(Number(result?.retryAfterSeconds ?? result?.cooldownSeconds ?? REACTION_COOLDOWN_SECONDS));
        setFeedback({ kind, phase: result?.reason === "rate_limited" ? "limited" : "asked" });
        return;
      }
      if (response.status === 409 && (result?.reason === "resting" || result?.reason === "not_watching")) {
        setFeedback({ kind, phase: result.reason });
        return;
      }
      if (response.status >= 500) {
        await checkUnanswered();
        return;
      }
      setFeedback({ kind, phase: "failed" });
    } finally {
      setPending(null);
    }
  }, [activeViewers, counts, onConfirmed, onReactions, onScheduled, reconcile]);

  const threshold = reactionThreshold(activeViewers ?? 0);

  return (
    <div className="reaction-buttons" data-hud-region="reactions" role="group" aria-label="Ask him to do something">
      {REACTION_KINDS.map((kind) => {
        const until = cooldowns[kind] ?? 0;
        const cooldownSeconds = Math.max(0, Math.ceil((until - now) / 1_000));
        const restSeconds = reactionRestSeconds(kind, scheduled, activeSeconds);
        const cooling = cooldownSeconds > 0;
        const resting = restSeconds > 0;
        const disabled = !enabled || cooling || resting || pending !== null;
        const { glyph, label } = REACTION_LABELS[kind];
        const phase = pending === kind
          ? "pending"
          : activeCrowdKind === REACTION_MOTION_KIND[kind]
            ? "active"
            : feedback?.kind === kind && feedback.phase === "queued"
              ? "queued"
              : cooling
                ? "cooldown"
                : resting
                  ? "resting"
                  : "ready";
        // Whichever wait ends later decides when this button is back; his rest is approximate.
        const restDecides = resting && restSeconds >= cooldownSeconds;
        return (
          <button
            key={kind}
            className="reaction-button"
            type="button"
            disabled={disabled}
            data-kind={kind}
            data-state={phase}
            aria-busy={pending === kind}
            onClick={() => void send(kind)}
            aria-label={restDecides
              ? `${label}, available again in about ${restSeconds} seconds`
              : cooling
                ? `${label}, available again in ${cooldownSeconds} seconds`
                : `${label}. ${counts[kind]} of ${threshold} watchers have asked.`}
          >
            <span aria-hidden="true">{glyph}</span>
            <span className="reaction-label">{label}</span>
            <span className="reaction-count">
              {restDecides ? `~${restSeconds}s` : cooling ? `${cooldownSeconds}s` : `${counts[kind]}/${threshold}`}
            </span>
          </button>
        );
      })}
      <span className="reaction-feedback" role="status">
        {feedback
          ? feedbackText(
              feedback,
              cooldowns[feedback.kind] ?? 0,
              now,
              reactionRestSeconds(feedback.kind, scheduled, activeSeconds),
            )
          : ""}
      </span>
    </div>
  );
}

function feedbackText(feedback: Feedback, cooldownUntil: number, now: number, restSeconds: number): string {
  const { label, asked, rested } = REACTION_LABELS[feedback.kind];
  const waitSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
  switch (feedback.phase) {
    case "sending":
      return `Sending ${label.toLowerCase()}…`;
    case "checking":
      return `Checking whether your ${label.toLowerCase()} arrived…`;
    case "contributing":
      if (feedback.expiresAtMs !== undefined
        && Number.isFinite(feedback.expiresAtMs)
        && now >= feedback.expiresAtMs) {
        return `${label} request expired — ask again.`;
      }
      return `${label} added · ${feedback.count}/${feedback.threshold}`;
    case "queued":
      return `${label} queued`;
    case "executing":
      return feedback.kind === "water"
        ? "He’s taking water"
        : feedback.kind === "wave" ? "He’s waving" : "He’s taking a photo";
    case "asked":
      return waitSeconds > 0 ? `You already asked for ${asked}. Again in ${waitSeconds}s.` : `${label} is ready again`;
    case "limited":
      return waitSeconds > 0 ? `Too many requests. Try again in ${waitSeconds}s.` : `${label} is ready again`;
    case "resting":
      return restSeconds > 0 ? `${rested}. Ask again in about ${restSeconds}s.` : `${label} is ready again`;
    case "not_watching":
      return "You aren’t counted as watching yet. Try again in a moment.";
    case "failed":
      return "Couldn’t send. Try again.";
    case "cooldown":
      return waitSeconds > 0 ? `${label} again in ${waitSeconds}s` : `${label} is ready again`;
  }
}
