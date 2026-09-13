"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CountryPack } from "@/lib/content/schema";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import { scenePositionAt } from "@/lib/world/route-clock";
import type {
  QualityTier,
  RouteRuntime,
  SceneAssetState,
  WalkingClock,
  WorldCommand,
  WorldDiagnosticsSnapshot,
} from "@/lib/world/types";
import type { TravelerCommand } from "@/lib/traveler/types";
import type { TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { StaticScene } from "./StaticScene";
import { stageScaleWarning, type StageFrame } from "@/lib/world/stage-layout";
import type { CharacterContacts, VisualGrade } from "@/lib/world/visual-grade";
import type { ScheduledActionView } from "@/lib/contracts";
import type { CanvasCapture } from "@/components/traveler/ProductCharacterStage3D";
import type { JourneyWeather } from "@/lib/weather/open-meteo";

const PixiScene = dynamic(
  () => import("./PixiScene").then((generated) => generated.PixiScene),
  { ssr: false },
);
const ProductCharacterStage3D = dynamic(
  () => import("@/components/traveler/ProductCharacterStage3D").then((generated) => generated.ProductCharacterStage3D),
  { ssr: false },
);

type Props = {
  pack: CountryPack;
  routeSeconds: number;
  routeRuntime: RouteRuntime;
  scheduledActions?: readonly ScheduledActionView[];
  walkingClock?: WalkingClock | null;
  weather?: JourneyWeather | null;
  sponsorSignUrl?: string | null;
  hundredWatchersAt?: string | null;
  onWorldCaptureReady?: (capture: CanvasCapture | null) => void;
  onCharacterCaptureReady?: (capture: CanvasCapture | null) => void;
  command: WorldCommand;
  /** Null until the device has been measured; the canvases wait so they mount once. */
  qualityTier: QualityTier | null;
  /** The journey snapshot is the real one (or confirmed unavailable), so its place is worth loading. */
  settled?: boolean;
  reducedMotion: boolean;
  travelerCommand?: TravelerCommand;
  onTravelerReady?: (ready: boolean) => void;
  onResidentReady?: (ready: boolean) => void;
  onMotionSample?: (frame: {assetVersion:string;motion:TravelerMotionSnapshot}) => void;
  onZoneChange: (zoneId: string, zoneLabel: string) => void;
  onAssetState?: (state: SceneAssetState) => void;
  onDiagnostics: (snapshot: WorldDiagnosticsSnapshot) => void;
  onWorldFailure: () => void;
  onReady: (renderer: "pixi" | "static") => void;
};

export function SceneStage({
  pack,
  routeSeconds,
  routeRuntime,
  scheduledActions,
  walkingClock = null,
  weather,
  sponsorSignUrl = null,
  hundredWatchersAt = null,
  onWorldCaptureReady,
  onCharacterCaptureReady,
  command,
  qualityTier,
  settled = true,
  reducedMotion,
  travelerCommand,
  onTravelerReady,
  onResidentReady,
  onMotionSample,
  onZoneChange,
  onAssetState,
  onDiagnostics,
  onWorldFailure,
  onReady,
}: Props) {
  const [pixiFailed, setPixiFailed] = useState(false);
  const [pixiReady, setPixiReady] = useState(false);
  const activeRenderer = useRef<"pixi" | "static" | null>(null);
  const stageFrame = useRef<StageFrame | null>(null);
  const contacts = useRef<CharacterContacts>({ traveler: null, resident: null });
  const grade = useRef<VisualGrade>({ exposure: 1, tint: { r: 1, g: 1, b: 1 } });
  const warnedScale = useRef(new Set<string>());
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A GPU/context failure is not an internet failure. Detect an unavailable
    // WebGL context before the asynchronous Pixi startup can hang, then let the
    // static painting become the renderer and allow presence to start normally.
    const check = window.requestAnimationFrame(() => {
      const canvas = document.createElement("canvas");
      let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
      try {
        context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      } catch {
        context = null;
      }
      if (!context) {
        setPixiFailed(true);
        onWorldFailure();
        return;
      }
      context.getExtension("WEBGL_lose_context")?.loseContext();
    });
    return () => window.cancelAnimationFrame(check);
  }, [onWorldFailure]);
  const publishStage = useCallback((frame: StageFrame, source: "static" | "pixi") => {
    if (source === "static" && activeRenderer.current === "pixi") return;
    stageFrame.current = frame;
    const warning = stageScaleWarning(frame.assetVersion, frame.zoneId, frame.layout);
    const warningKey = `${frame.assetVersion}/${frame.zoneId}`;
    if (warning && !warnedScale.current.has(warningKey)) {
      warnedScale.current.add(warningKey);
      console.warn(warning);
    }
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
  const route = scenePositionAt(pack, routeSeconds);
  const zone = pack.route.zones[route.zoneIndex] ?? pack.route.zones[0]!;
  // The same resolution the live world renders at, so the poster and the world
  // choose the same rendition.
  const resolution = qualityTier && settled
    ? Math.min(window.devicePixelRatio || 1, QUALITY_LIMITS[qualityTier].resolution)
    : null;

  return (
    <div ref={container} className="scene-stage" data-renderer={pixiReady ? "pixi" : "static"}>
      <StaticScene zone={zone} assetVersion={pack.assetVersion} resolution={resolution}
        defer={!pixiFailed} active={!pixiReady} onStageFrame={publishStage} onReady={staticReady} />
      {qualityTier && settled && !pixiFailed ? (
        <PixiScene
          contacts={contacts}
          grade={grade}
          pack={pack}
          onStageFrame={publishStage}
          routeSeconds={routeSeconds}
          routeRuntime={routeRuntime}
          scheduledActions={scheduledActions}
          walkingClock={walkingClock}
          weather={weather}
          sponsorSignUrl={sponsorSignUrl}
          hundredWatchersAt={hundredWatchersAt}
          onCaptureReady={onWorldCaptureReady}
          command={command}
          qualityTier={qualityTier}
          reducedMotion={reducedMotion}
          travelerCommand={travelerCommand}
          onMotionSample={onMotionSample}
          onZoneChange={onZoneChange}
          onAssetState={onAssetState}
          onDiagnostics={onDiagnostics}
          onReady={liveReady}
          onFailure={liveFailed}
        />
      ) : null}
      {qualityTier && !pixiFailed ? (
        <ProductCharacterStage3D
          contacts={contacts}
          grade={grade}
          pack={pack}
          stageFrame={stageFrame}
          routeRuntime={routeRuntime}
          scheduledActions={scheduledActions}
          walkingClock={walkingClock}
          onCaptureReady={onCharacterCaptureReady}
          command={travelerCommand}
          qualityTier={qualityTier}
          onTravelerAvailability={onTravelerReady}
          onResidentAvailability={onResidentReady}
        />
      ) : null}
      <div className="scene-grade" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />
    </div>
  );
}
