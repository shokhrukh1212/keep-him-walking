import { useCallback, useEffect, useRef, useState } from "react";
import {
  REACTION_COOLDOWN_SECONDS,
  REACTION_KINDS,
  reactionThreshold,
  type ReactionKind,
} from "@/lib/reactions/threshold";
import type { CrowdActionKind } from "@/lib/traveler/motion-clock";
import type { ReactionCounts } from "@/lib/contracts";

const REACTION_LABELS: Record<ReactionKind, { glyph: string; label: string }> = {
  wave: { glyph: "👋", label: "Wave" },
  water: { glyph: "💧", label: "Water" },
  photo: { glyph: "📷", label: "Photo" },
};

type Props = {
  counts: ReactionCounts;
  activeViewers: number | null;
  /** False in offline preview, where nothing can be sent. */
  enabled: boolean;
  /** The crowd action he is performing right now, if any. */
  activeCrowdKind: CrowdActionKind | null;
  onScheduled?: (kind: ReactionKind, atActiveSecond: number) => void;
  onConfirmed?: () => void;
};

type CooldownMap = Partial<Record<ReactionKind, number>>;
type Feedback = {
  kind: ReactionKind;
  phase: "sending" | "contributing" | "queued" | "executing" | "cooldown" | "failed";
  count?: number;
  threshold?: number;
};

export function ReactionButtons({
  counts,
  activeViewers,
  enabled,
  activeCrowdKind,
  onScheduled,
  onConfirmed,
}: Props) {
  const [cooldowns, setCooldowns] = useState<CooldownMap>({});
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<ReactionKind | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const previousCrowdKind = useRef<CrowdActionKind | null>(null);

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
    setPending(kind);
    setFeedback({ kind, phase: "sending" });
    try {
      const response = await fetch("/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 429) {
          const cooldownSeconds = Number(result?.cooldownSeconds ?? REACTION_COOLDOWN_SECONDS);
          setCooldowns((current) => ({ ...current, [kind]: Date.now() + cooldownSeconds * 1_000 }));
          setFeedback({ kind, phase: "cooldown" });
          return;
        }
        throw new Error("Reaction failed");
      }
      const cooldownSeconds = Number(result?.cooldownSeconds ?? REACTION_COOLDOWN_SECONDS);
      setCooldowns((current) => ({ ...current, [kind]: Date.now() + cooldownSeconds * 1_000 }));
      if (response.ok && typeof result?.scheduledAt === "number") {
        onScheduled?.(kind, result.scheduledAt);
        setFeedback({ kind, phase: "queued" });
      } else {
        setFeedback({
          kind,
          phase: "contributing",
          count: Number(result?.count ?? counts[kind]),
          threshold: Number(result?.threshold ?? reactionThreshold(activeViewers ?? 0)),
        });
      }
      if (response.ok) onConfirmed?.();
    } catch {
      setFeedback({ kind, phase: "failed" });
    } finally {
      setPending(null);
    }
  }, [activeViewers, counts, onConfirmed, onScheduled]);

  const threshold = reactionThreshold(activeViewers ?? 0);

  return (
    <div className="reaction-buttons" data-hud-region="reactions" role="group" aria-label="Ask him to do something">
      {REACTION_KINDS.map((kind) => {
        const until = cooldowns[kind] ?? 0;
        const remaining = Math.max(0, Math.ceil((until - now) / 1_000));
        const cooling = remaining > 0;
        const disabled = !enabled || cooling || pending !== null;
        const { glyph, label } = REACTION_LABELS[kind];
        return (
          <button
            key={kind}
            className="reaction-button"
            type="button"
            disabled={disabled}
            data-kind={kind}
            onClick={() => void send(kind)}
            aria-label={cooling
              ? `${label}, available again in ${remaining} seconds`
              : `${label}. ${counts[kind]} of ${threshold} watchers have asked.`}
          >
            <span aria-hidden="true">{glyph}</span>
            <span className="reaction-label">{label}</span>
            <span className="reaction-count">
              {cooling ? `${remaining}s` : `${counts[kind]}/${threshold}`}
            </span>
          </button>
        );
      })}
      <span className="reaction-feedback" role="status">
        {feedback ? feedbackText(feedback, cooldowns[feedback.kind] ?? 0, now) : ""}
      </span>
    </div>
  );
}

function feedbackText(feedback: Feedback, cooldownUntil: number, now: number) {
  const label = REACTION_LABELS[feedback.kind].label;
  if (feedback.phase === "sending") return `Sending ${label.toLowerCase()}…`;
  if (feedback.phase === "contributing") return `${label} added · ${feedback.count}/${feedback.threshold}`;
  if (feedback.phase === "queued") return `${label} queued`;
  if (feedback.phase === "executing") return feedback.kind === "water"
    ? "He’s taking water"
    : feedback.kind === "wave" ? "He’s waving" : "He’s taking a photo";
  if (feedback.phase === "failed") return "Couldn’t send. Try again.";
  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
  return remaining > 0 ? `${label} again in ${remaining}s` : `${label} is ready again`;
}
