"use client";

import type { DialogueLine } from "@/lib/content/schema";

type Props = {
  line: DialogueLine | null;
  locationLabel?: string;
  npcSrc: string;
  replayAvailable: boolean;
  replayOpen: boolean;
  onReplay: () => void;
  onCloseReplay: () => void;
};

export function EncounterDialogue({
  line,
  locationLabel,
  npcSrc,
  replayAvailable,
  replayOpen,
  onReplay,
  onCloseReplay,
}: Props) {
  const visible = Boolean(line) || replayOpen;
  return (
    <>
      {visible ? (
        <div className="npc-wrap" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={npcSrc} alt="" draggable={false} />
        </div>
      ) : null}
      {line ? (
        <section className={`dialogue-bubble dialogue-${line.speaker}`} aria-live="polite">
          <span className="eyebrow">{line.speaker === "npc" ? "LOCAL CHEF" : "TRAVELER"}</span>
          <p>{line.text}</p>
          {locationLabel ? <small>{locationLabel}</small> : null}
        </section>
      ) : null}
      {replayOpen ? (
        <section className="dialogue-panel" aria-label="Today’s conversation transcript">
          <div>
            <span className="eyebrow">CONVERSATION RECAP</span>
            <button type="button" onClick={onCloseReplay} aria-label="Close transcript">×</button>
          </div>
          <p><strong>Traveler:</strong> What should I try while I’m in Tashkent?</p>
          <p><strong>Local chef:</strong> You haven’t eaten plov yet?</p>
          <p><strong>Traveler:</strong> Not yet. Is that a problem?</p>
          <p><strong>Local chef:</strong> A very serious problem. Follow me.</p>
        </section>
      ) : null}
      {replayAvailable && !replayOpen && !line ? (
        <button className="transcript-button" type="button" onClick={onReplay}>
          Read today’s conversation
        </button>
      ) : null}
    </>
  );
}
