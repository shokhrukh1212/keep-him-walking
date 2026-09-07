"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { CountryPack } from "@/lib/content/schema";
import type { TravelerCommand } from "@/lib/traveler/types";

const RiveTravelerRenderer = dynamic(
  () => import("./RiveTravelerRenderer").then((module) => module.RiveTravelerRenderer),
  { ssr: false },
);

type Props = {
  pack: CountryPack;
  command: TravelerCommand;
  onReady: () => void;
};

export function Traveler({ pack, command, onReady }: Props) {
  const [riveFailed, setRiveFailed] = useState(false);
  const riveUrl = pack.traveler.riveUrl;
  const useRive = pack.traveler.driver === "rive" && Boolean(riveUrl) && !riveFailed;
  return (
    <div
      className="traveler-wrap"
      role="img"
      aria-label={`Traveler is ${command.state.replaceAll("_", " ")}`}
    >
      {useRive && riveUrl ? (
        <RiveTravelerRenderer
          src={riveUrl}
          artboard={pack.traveler.artboard}
          stateMachine={pack.traveler.stateMachine}
          viewModel={pack.traveler.viewModel ?? "JourneyCharacterVM"}
          command={command}
          onReady={onReady}
          onFailure={() => setRiveFailed(true)}
        />
      ) : (
        // A single connected idle image remains until the Pixi puppet is ready.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="traveler-safe-fallback" src={pack.traveler.fallbackSprites.idle} alt="" onLoad={onReady} onError={onReady} />
      )}
    </div>
  );
}
