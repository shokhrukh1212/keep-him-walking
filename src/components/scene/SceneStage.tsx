"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CountryPack } from "@/lib/content/schema";
import { routePositionAt } from "@/lib/world/route-clock";
import type { QualityTier, RouteRuntime, WorldCommand, WorldDiagnosticsSnapshot } from "@/lib/world/types";
import { StaticScene } from "./StaticScene";

const PixiScene = dynamic(
  () => import("./PixiScene").then((module) => module.PixiScene),
  { ssr: false },
);

type Props = {
  pack: CountryPack;
  routeSeconds: number;
  routeRuntime: RouteRuntime;
  command: WorldCommand;
  qualityTier: QualityTier;
  reducedMotion: boolean;
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
  onZoneChange,
  onDiagnostics,
  onWorldFailure,
  onReady,
}: Props) {
  const [pixiFailed, setPixiFailed] = useState(false);
  const [pixiReady, setPixiReady] = useState(false);
  const activeRenderer = useRef<"pixi" | "static" | null>(null);
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
    if (!reducedMotion && !pixiFailed) return;
    const update = window.setTimeout(() => {
      activeRenderer.current = "static";
      setPixiReady(false);
      onReady("static");
    }, 0);
    return () => window.clearTimeout(update);
  }, [onReady, pixiFailed, reducedMotion]);
  const route = routePositionAt(pack, routeSeconds);
  const fallbackUrl = pack.route.zones[route.zoneIndex]?.fallbackUrl ?? pack.scene.fallbackUrl;

  return (
    <div className="scene-stage" data-renderer={pixiReady && !reducedMotion ? "pixi" : "static"}>
      <StaticScene src={fallbackUrl} onReady={staticReady} />
      {!reducedMotion && !pixiFailed ? (
        <PixiScene
          pack={pack}
          routeSeconds={routeSeconds}
          routeRuntime={routeRuntime}
          command={command}
          qualityTier={qualityTier}
          reducedMotion={reducedMotion}
          onZoneChange={onZoneChange}
          onDiagnostics={onDiagnostics}
          onReady={liveReady}
          onFailure={liveFailed}
        />
      ) : null}
      <div className="scene-grade" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />
    </div>
  );
}
