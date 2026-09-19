"use client";

import { useState } from "react";
import type { ReactionKind } from "@/lib/reactions/threshold";

const ACTIONS: ReadonlyArray<{ kind: ReactionKind; glyph: string; label: string }> = [
  { kind: "wave", glyph: "👋", label: "Wave" },
  { kind: "water", glyph: "💧", label: "Water" },
  { kind: "photo", glyph: "📷", label: "Photo" },
];

export function WaitingReactionButtons({ enabled, onAccepted }: {
  enabled: boolean;
  onAccepted: (kind: ReactionKind) => void;
}) {
  const [pending, setPending] = useState<ReactionKind | null>(null);
  const [cooling, setCooling] = useState(false);
  const [message, setMessage] = useState("");
  const send = async (kind: ReactionKind) => {
    if (pending || cooling) return;
    setPending(kind); setMessage("");
    try {
      const response = await fetch("/api/reactions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }),
      });
      if (!response.ok) {
        setMessage(response.status === 429 ? "Give him a moment." : "That action did not reach him.");
        return;
      }
      setCooling(true);
      window.setTimeout(() => setCooling(false), 5_000);
      setMessage(`${ACTIONS.find((action) => action.kind === kind)?.label ?? "Action"} received.`);
      onAccepted(kind);
    } catch {
      setMessage("That action did not reach him.");
    } finally {
      setPending(null);
    }
  };
  return <>
    <div className="reaction-buttons" data-hud-region="reactions" role="group" aria-label="Interact while he waits">
      {ACTIONS.map((action) => <button key={action.kind} className="reaction-button" type="button"
        disabled={!enabled || pending !== null || cooling}
        aria-label={action.label} onClick={() => void send(action.kind)}>
        <span aria-hidden="true">{action.glyph}</span><span>{pending === action.kind ? "Sending…" : action.label}</span>
      </button>)}
    </div>
    <p className="sr-only" aria-live="polite">{message}</p>
  </>;
}
