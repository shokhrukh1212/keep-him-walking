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
    if (!rive.isPlaying) rive.play();
    for (const input of rive.stateMachineInputs?.(stateMachine) ?? []) {
      if (input.name === "walking") input.value = command.walkingSpeed > 0;
      if (input.name === "walkingSpeed") input.value = command.walkingSpeed;
      if (input.name === "reducedMotion") input.value = command.reducedMotion;
      if (input.name === "action") input.value = travelerActionIndex(command.state);
    }
  }, [command.reducedMotion, command.state, command.walkingSpeed, rive, stateMachine]);

  return <RiveComponent aria-label={`Traveler: ${command.state.replaceAll("_", " ")}`} />;
}

function travelerActionIndex(state: TravelerCommand["state"]): number {
  return [
    "idle", "start_walk", "walk", "slow_walk", "stop", "rest", "notice",
    "approach", "talk", "listen", "react", "wave", "phone", "drink",
    "photo", "sit", "goodbye", "resume_walk",
  ].indexOf(state);
}
