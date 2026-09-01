"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { CountryPack } from "@/lib/content/schema";
import type { TravelerCommand } from "@/lib/traveler/types";

type Props = {
  command: TravelerCommand;
  pack: CountryPack;
  onReady: () => void;
};

export function SpriteTravelerRenderer({ command, pack, onReady }: Props) {
  const [frame, setFrame] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const reported = useRef(false);
  const moving = ["start_walk", "walk", "slow_walk", "approach", "resume_walk"].includes(
    command.state,
  );
  const cycle = pack.traveler.walkCycle;

  useEffect(() => {
    if (!cycle || !moving || command.reducedMotion || command.walkingSpeed <= 0) {
      return;
    }
    const frameDelay = 1_000 / Math.max(1, cycle.framesPerSecond * command.walkingSpeed);
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % cycle.frames.length),
      frameDelay,
    );
    return () => window.clearInterval(timer);
  }, [command.reducedMotion, command.walkingSpeed, cycle, moving]);

  const staticState = command.reducedMotion && moving ? "stop" : command.state;
  const src = moving && cycle && !command.reducedMotion
    ? cycle.frames[frame % cycle.frames.length]
    : pack.traveler.fallbackSprites[staticState] ?? pack.traveler.fallbackSprites.idle;
  const reportReady = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onReady();
  }, [onReady]);
  useEffect(() => {
    if (!src) {
      reportReady();
      return;
    }
    if (image.current?.complete) reportReady();
    const fallback = window.setTimeout(reportReady, 2_500);
    return () => window.clearTimeout(fallback);
  }, [reportReady, src]);
  if (!src) return null;
  const style = { "--walk-speed": Math.max(0.25, command.walkingSpeed) } as CSSProperties;
  return (
    <div
      className="traveler-sprite"
      data-state={command.state}
      data-walking={moving}
      data-reduced-motion={command.reducedMotion}
      style={style}
    >
      <div className="character-shadow" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={src} alt="" onLoad={reportReady} onError={reportReady} draggable={false} />
    </div>
  );
}
