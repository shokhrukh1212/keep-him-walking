"use client";

import type { CountryPack } from "@/lib/content/schema";
import type { TravelerCommand } from "@/lib/traveler/types";

type Props = {
  command: TravelerCommand;
  pack: CountryPack;
  onReady: () => void;
};

export function SpriteTravelerRenderer({ command, pack, onReady }: Props) {
  const src =
    pack.traveler.fallbackSprites[command.state] ??
    pack.traveler.fallbackSprites.idle;
  if (!src) return null;
  return (
    <div
      className="traveler-sprite"
      data-state={command.state}
      data-walking={command.state === "walk" || command.state === "resume_walk"}
      data-reduced-motion={command.reducedMotion}
    >
      <div className="character-shadow" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onLoad={onReady} draggable={false} />
    </div>
  );
}
