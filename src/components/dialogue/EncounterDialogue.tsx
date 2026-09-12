"use client";

import {type CSSProperties} from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { DialogueLine } from "@/lib/content/schema";

type Props = {
  line: DialogueLine | null;
  /** Who is speaking, by name: the fictional resident or the traveler. */
  speakerLabel?: string;
  npcSrc: string;
  motionSeconds?: number;
  reducedMotion?: boolean;
  showNpcImage?: boolean;
};

export function EncounterDialogue({
  line,
  speakerLabel,
  npcSrc,
  motionSeconds = 0,
  reducedMotion = false,
  showNpcImage = true,
}: Props) {
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
        <section className={`dialogue-bubble dialogue-${line.speaker}`} aria-live="polite">
          <span className="eyebrow">{speakerLabel ?? (line.speaker === "npc" ? "Local resident" : "Traveler")}</span>
          <p>{line.text}</p>
        </section>
      ) : null}
    </>
  );
}
