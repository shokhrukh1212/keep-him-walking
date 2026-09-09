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
};

type CooldownMap = Partial<Record<ReactionKind, number>>;

export function ReactionButtons({
  counts,
  activeViewers,
  enabled,
  activeCrowdKind,
  onScheduled,
}: Props) {
  const [cooldowns, setCooldowns] = useState<CooldownMap>({});
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<ReactionKind | null>(null);
  const [heard, setHeard] = useState(false);
  const previousCrowdKind = useRef<CrowdActionKind | null>(null);

  // One shared ticker drives every countdown, so the buttons stay honest about
  // how long is left without a timer per button.
  useEffect(() => {
    if (Object.keys(cooldowns).length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [cooldowns]);

  // "He heard you" is a one-second pulse the moment a crowd action begins.
  useEffect(() => {
    const previous = previousCrowdKind.current;
    previousCrowdKind.current = activeCrowdKind;
    if (activeCrowdKind === null || previous === activeCrowdKind) return;
    setHeard(true);
    const timer = window.setTimeout(() => setHeard(false), 1_000);
    return () => window.clearTimeout(timer);
  }, [activeCrowdKind]);

  const send = useCallback(async (kind: ReactionKind) => {
    setPending(kind);
    try {
      const response = await fetch("/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const result = await response.json().catch(() => null);
      const cooldownSeconds = Number(result?.cooldownSeconds ?? REACTION_COOLDOWN_SECONDS);
      setCooldowns((current) => ({ ...current, [kind]: Date.now() + cooldownSeconds * 1_000 }));
      if (response.ok && typeof result?.scheduledAt === "number") {
        onScheduled?.(kind, result.scheduledAt);
      }
    } catch {
      // A failed send simply leaves the button available again.
    } finally {
      setPending(null);
    }
  }, [onScheduled]);

  const threshold = reactionThreshold(activeViewers ?? 0);

  return (
    <div className="reaction-buttons" data-hud-region="reactions" data-heard={heard} role="group" aria-label="Ask him to do something">
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
      {heard ? <span className="reaction-heard" role="status">he heard you</span> : null}
    </div>
  );
}
