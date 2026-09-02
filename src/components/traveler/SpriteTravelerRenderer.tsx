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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const reported = useRef(false);
  const moving = ["start_walk", "walk", "slow_walk", "approach", "resume_walk"].includes(
    command.state,
  );
  const manifest = pack.traveler.spriteManifest;
  const requestedState = command.reducedMotion && moving ? "stop" : command.state;
  const activeClip = manifest?.clips[requestedState] ?? manifest?.clips.idle;
  const cycle = pack.traveler.walkCycle;

  useEffect(() => {
    const reset = window.requestAnimationFrame(() => {
      setFrame(0);
      setFailedSrc(null);
    });
    return () => window.cancelAnimationFrame(reset);
  }, [requestedState]);

  useEffect(() => {
    if (!activeClip || activeClip.frames.length <= 1 || command.reducedMotion) return;
    const speed = moving ? Math.max(0.25, command.walkingSpeed) : 1;
    const frameDelay = 1_000 / Math.max(1, activeClip.framesPerSecond * speed);
    const timer = window.setInterval(
      () => setFrame((current) => activeClip.loop
        ? (current + 1) % activeClip.frames.length
        : Math.min(activeClip.frames.length - 1, current + 1)),
      frameDelay,
    );
    return () => window.clearInterval(timer);
  }, [activeClip, command.reducedMotion, command.walkingSpeed, moving]);

  const clipSrc = command.reducedMotion ? undefined : activeClip?.frames[frame % activeClip.frames.length];
  const stateFallbackSrc = pack.traveler.fallbackSprites[requestedState] ?? pack.traveler.fallbackSprites.idle;
  const errorFallbackSrc = pack.traveler.fallbackSprites.idle ?? stateFallbackSrc;
  const src = failedSrc === clipSrc ? errorFallbackSrc : clipSrc ?? (moving && cycle && !command.reducedMotion ? cycle.frames[frame % cycle.frames.length] : stateFallbackSrc);
  const metadata = activeClip?.metadata[frame % activeClip.metadata.length];
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
  const style = {
    "--walk-speed": Math.max(0.25, command.walkingSpeed),
    "--shadow-scale": metadata?.shadowScale ?? 1,
    "--sponsor-x": `${(metadata?.sponsorAnchor.x ?? 0.34) * 100}%`,
    "--sponsor-y": `${(metadata?.sponsorAnchor.y ?? 0.34) * 100}%`,
    "--sponsor-scale": metadata?.sponsorAnchor.scale ?? 0.13,
    "--sponsor-rotation": `${metadata?.sponsorAnchor.rotation ?? 0}deg`,
  } as CSSProperties;
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
      <img
        ref={image}
        className="traveler-frame"
        src={src}
        alt=""
        onLoad={reportReady}
        onError={() => { setFailedSrc(src); reportReady(); }}
        draggable={false}
      />
      {command.sponsorPatchUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="traveler-sponsor-patch" src={command.sponsorPatchUrl} alt="" draggable={false} />
      ) : null}
    </div>
  );
}
