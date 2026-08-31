"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { CountryPack } from "@/lib/content/schema";
import type { TravelerCommand } from "@/lib/traveler/types";
import { SpriteTravelerRenderer } from "./SpriteTravelerRenderer";

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
  return (
    <div
      className="traveler-wrap"
      role="img"
      aria-label={`Traveler is ${command.state.replaceAll("_", " ")}`}
    >
      {riveUrl && !riveFailed ? (
        <RiveTravelerRenderer
          src={riveUrl}
          artboard={pack.traveler.artboard}
          stateMachine={pack.traveler.stateMachine}
          command={command}
          onReady={onReady}
          onFailure={() => setRiveFailed(true)}
        />
      ) : (
        <SpriteTravelerRenderer command={command} pack={pack} onReady={onReady} />
      )}
    </div>
  );
}
