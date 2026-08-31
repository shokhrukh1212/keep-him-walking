"use client";

import { useEffect } from "react";
import { useRive } from "@rive-app/react-webgl2";
import type { TravelerCommand } from "@/lib/traveler/types";

type Props = {
  src: string;
  artboard: string;
  stateMachine: string;
  command: TravelerCommand;
  onReady: () => void;
  onFailure: () => void;
};

export function RiveTravelerRenderer({
  src,
  artboard,
  stateMachine,
  command,
  onReady,
  onFailure,
}: Props) {
  const { rive, RiveComponent } = useRive({
    src,
    artboard,
    stateMachines: stateMachine,
    autoplay: true,
    onLoad: onReady,
    onLoadError: onFailure,
  });

  useEffect(() => {
    if (!rive) return;
    if (command.reducedMotion) rive.pause();
    else if (!rive.isPlaying) rive.play();
  }, [command.reducedMotion, command.state, rive]);

  return <RiveComponent aria-label={`Traveler: ${command.state.replaceAll("_", " ")}`} />;
}
