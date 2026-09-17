"use client";

import {type CSSProperties} from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { DialogueLine } from "@/lib/content/schema";
import { captionCueAt } from "@/lib/world/captions";

type Props = {
  line: DialogueLine | null;
  /** Who is speaking, by name: the fictional resident or the traveler. */
  speakerLabel?: string;
  npcSrc: string;
  motionSeconds?: number;
  reducedMotion?: boolean;
  showNpcImage?: boolean;
  /**
   * What the bubble is: a meeting with a resident, or the line he says to the
   * viewer while nobody is watching. Only the first one is a local encounter.
   */
  kind?: "encounter" | "waiting";
};

export function EncounterDialogue({
  line,
  speakerLabel,
  npcSrc,
  motionSeconds = 0,
  reducedMotion = false,
  showNpcImage = true,
  kind = "encounter",
}: Props) {
  const caption = line ? captionCueAt(line, motionSeconds) : "";
  return (
    <>
      {line && showNpcImage && npcSrc ? (
        <div
          className="npc-wrap"
          aria-hidden="true"
          style={{
            "--npc-life-y": "0px",
            "--npc-life-rotation": `${reducedMotion ? 0 : Math.sin(motionSeconds * 1.35) * 0.12}deg`,
          } as CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicAssetUrl(npcSrc)} crossOrigin="anonymous" alt="" draggable={false} />
        </div>
      ) : null}
      {line ? (
        <section className={`dialogue-bubble dialogue-${line.speaker}`} data-dialogue={kind} aria-live="polite">
          <span className="eyebrow">{speakerLabel ?? (line.speaker === "npc" ? "Local resident" : "Traveler")}</span>
          <p>{caption}</p>
        </section>
      ) : null}
    </>
  );
}
