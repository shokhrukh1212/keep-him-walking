"use client";

import { useEffect } from "react";
import {
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceBoolean,
  useViewModelInstanceEnum,
  useViewModelInstanceImage,
  useViewModelInstanceNumber,
} from "@rive-app/react-webgl2";
import { decodeImage } from "@rive-app/webgl2";
import type { TravelerCommand } from "@/lib/traveler/types";

type Props = {
  src: string;
  artboard: string;
  stateMachine: string;
  viewModel: string;
  command: TravelerCommand;
  onReady: () => void;
  onFailure: () => void;
};

export function RiveTravelerRenderer({
  src,
  artboard,
  stateMachine,
  viewModel,
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
  const model = useViewModel(rive, { name: viewModel });
  const instance = useViewModelInstance(model, { useDefault: true, rive });
  const walking = useViewModelInstanceBoolean("walking", instance);
  const walkingSpeed = useViewModelInstanceNumber("walkingSpeed", instance);
  const action = useViewModelInstanceEnum("action", instance);
  const mood = useViewModelInstanceEnum("mood", instance);
  const facingRight = useViewModelInstanceBoolean("facingRight", instance);
  const reducedMotion = useViewModelInstanceBoolean("reducedMotion", instance);
  const sponsorPatch = useViewModelInstanceImage("sponsorPatch", instance);

  useEffect(() => {
    if (!rive) return;
    if (!rive.isPlaying) rive.play();
    for (const input of rive.stateMachineInputs?.(stateMachine) ?? []) {
      if (input.name === "walking") input.value = command.walkingSpeed > 0;
      if (input.name === "walkingSpeed") input.value = command.walkingSpeed;
      if (input.name === "reducedMotion") input.value = command.reducedMotion;
      if (input.name === "action") input.value = travelerActionIndex(command.state);
      if (input.name === "mood") input.value = travelerMoodIndex(command.mood);
      if (input.name === "facingRight") input.value = command.facing === "right";
    }
    walking.setValue(command.walkingSpeed > 0);
    walkingSpeed.setValue(command.walkingSpeed);
    action.setValue(command.state);
    mood.setValue(command.mood);
    facingRight.setValue(command.facing === "right");
    reducedMotion.setValue(command.reducedMotion);
  }, [action, command.facing, command.mood, command.reducedMotion, command.state, command.walkingSpeed, facingRight, mood, reducedMotion, rive, stateMachine, walking, walkingSpeed]);

  useEffect(() => {
    let disposed = false;
    let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;
    if (!command.sponsorPatchUrl) {
      sponsorPatch.setValue(null);
      return;
    }
    void fetch(command.sponsorPatchUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Sponsor patch failed to load");
        return response.arrayBuffer();
      })
      .then((bytes) => decodeImage(new Uint8Array(bytes)))
      .then((image) => {
        decoded = image;
        if (!disposed) sponsorPatch.setValue(image);
      })
      .catch(() => sponsorPatch.setValue(null));
    return () => {
      disposed = true;
      sponsorPatch.setValue(null);
      decoded?.unref();
    };
  }, [command.sponsorPatchUrl, sponsorPatch]);

  return <RiveComponent aria-label={`Traveler: ${command.state.replaceAll("_", " ")}`} />;
}

function travelerMoodIndex(mood: TravelerCommand["mood"]): number {
  return ["neutral", "curious", "surprised", "amused", "thoughtful"].indexOf(mood);
}

function travelerActionIndex(state: TravelerCommand["state"]): number {
  return [
    "idle", "start_walk", "walk", "slow_walk", "stop", "notice",
    "approach", "greet", "talk", "listen", "react", "goodbye", "rest",
    "wave", "phone", "drink", "photo", "sit", "resume_walk",
  ].indexOf(state);
}
