"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CountryPack } from "@/lib/content/schema";
import { routePositionAt } from "@/lib/world/route-clock";
import type { QualityTier, RouteRuntime, WorldCommand, WorldDiagnosticsSnapshot } from "@/lib/world/types";
import type { TravelerCommand } from "@/lib/traveler/types";
import type { TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { StaticScene } from "./StaticScene";
import type { StageFrame } from "@/lib/world/stage-layout";

const PixiScene = dynamic(
  () => import("./PixiScene").then((module) => module.PixiScene),
  { ssr: false },
);
const ProductCharacterStage3D = dynamic(
  () => import("@/components/traveler/ProductCharacterStage3D").then((module) => module.ProductCharacterStage3D),
  { ssr: false },
);

type Props = {
  pack: CountryPack;
  routeSeconds: number;
  routeRuntime: RouteRuntime;
  command: WorldCommand;
  qualityTier: QualityTier;
  reducedMotion: boolean;
  travelerCommand?: TravelerCommand;
  onTravelerReady?: (ready: boolean) => void;
  onResidentReady?: (ready: boolean) => void;
  onMotionSample?: (frame: {assetVersion:string;motion:TravelerMotionSnapshot}) => void;
  onZoneChange: (zoneId: string, zoneLabel: string) => void;
  onDiagnostics: (snapshot: WorldDiagnosticsSnapshot) => void;
  onWorldFailure: () => void;
  onReady: (renderer: "pixi" | "static") => void;
};

export function SceneStage({
  pack,
  routeSeconds,
  routeRuntime,
  command,
  qualityTier,
  reducedMotion,
  travelerCommand,
  onTravelerReady,
  onResidentReady,
  onMotionSample,
  onZoneChange,
  onDiagnostics,
  onWorldFailure,
  onReady,
}: Props) {
  const [pixiFailed, setPixiFailed] = useState(false);
  const [pixiReady, setPixiReady] = useState(false);
  const activeRenderer = useRef<"pixi" | "static" | null>(null);
  const stageFrame = useRef<StageFrame | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const publishStage = useCallback((frame: StageFrame, source: "static" | "pixi") => {
    if (source === "static" && activeRenderer.current === "pixi") return;
    stageFrame.current = frame;
    // The loading traveler and fallback NPC are siblings of SceneStage.
    const shell = container.current?.closest<HTMLElement>(".journey-shell");
    shell?.style.setProperty("--stage-person-height", `${frame.layout.personHeightPx}px`);
    shell?.style.setProperty("--stage-bottom", `${frame.viewportH - frame.layout.groundY}px`);
  }, []);
  const staticReady = useCallback(() => {
    if (activeRenderer.current === "pixi") return;
    activeRenderer.current = "static";
    onReady("static");
  }, [onReady]);
  const liveReady = useCallback(() => {
    activeRenderer.current = "pixi";
    setPixiReady(true);
    onReady("pixi");
  }, [onReady]);
  const liveFailed = useCallback(() => {
    activeRenderer.current = "static";
    setPixiFailed(true);
    onReady("static");
    onWorldFailure();
  }, [onReady, onWorldFailure]);
  useEffect(() => {
    if (!pixiFailed) return;
    const update = window.setTimeout(() => {
      activeRenderer.current = "static";
      setPixiReady(false);
      onReady("static");
    }, 0);
    return () => window.clearTimeout(update);
  }, [onReady, pixiFailed]);
  const route = routePositionAt(pack, routeSeconds);
  const fallbackUrl = pack.route.zones[route.zoneIndex]?.fallbackUrl ?? pack.scene.fallbackUrl;

  return (
    <div ref={container} className="scene-stage" data-renderer={pixiReady ? "pixi" : "static"}>
      <StaticScene src={fallbackUrl} zone={pack.route.zones[route.zoneIndex]} assetVersion={pack.assetVersion}
        active={!pixiReady} onStageFrame={publishStage} onReady={staticReady} />
      {!pixiFailed ? (
        <PixiScene
          pack={pack}
          onStageFrame={publishStage}
          routeSeconds={routeSeconds}
          routeRuntime={routeRuntime}
          command={command}
          qualityTier={qualityTier}
          reducedMotion={reducedMotion}
          travelerCommand={travelerCommand}
          onMotionSample={onMotionSample}
          onZoneChange={onZoneChange}
          onDiagnostics={onDiagnostics}
          onReady={liveReady}
          onFailure={liveFailed}
        />
      ) : null}
      <ProductCharacterStage3D
        pack={pack}
        stageFrame={stageFrame}
        routeRuntime={routeRuntime}
        command={travelerCommand}
        qualityTier={qualityTier}
        onTravelerAvailability={onTravelerReady}
        onResidentAvailability={onResidentReady}
      />
      <div className="scene-grade" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />
    </div>
  );
}
