"use client";

import type { MotionPhase, QualityTier, WorldDiagnosticsSnapshot } from "@/lib/world/types";

type Props = {
  snapshot: WorldDiagnosticsSnapshot | null;
  locomotionPhase: MotionPhase;
  qualityTier: QualityTier;
  renderer: "pixi" | "static" | null;
  authoritativeRouteSeconds: number;
};

export function WorldDiagnostics({
  snapshot,
  locomotionPhase,
  qualityTier,
  renderer,
  authoritativeRouteSeconds,
}: Props) {
  const enabled = useSyncExternalStore(
    () => () => undefined,
    () =>
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("debug") === "world",
    () => false,
  );
  if (!enabled) return null;

  return (
    <aside
      className="world-diagnostics"
      aria-label="World diagnostics"
      data-testid="world-diagnostics"
      data-segment={snapshot?.segmentIndex ?? 0}
      data-zone={snapshot?.zoneId ?? ""}
      data-signature={snapshot?.segmentSignature ?? ""}
      data-live-objects={snapshot?.liveObjects ?? 0}
      data-fps={snapshot?.fps ?? 0}
      data-p95-frame-ms={snapshot?.p95FrameMs ?? 0}
      data-route-seconds={snapshot?.routeSeconds ?? 0}
      data-authoritative-route-seconds={authoritativeRouteSeconds}
    >
      <strong>WORLD / {renderer ?? "loading"} / {qualityTier}</strong>
      <span>authoritative {authoritativeRouteSeconds.toFixed(2)}s</span>
      <span>presented {(snapshot?.routeSeconds ?? 0).toFixed(2)}s · {(snapshot?.distance ?? 0).toFixed(0)}u</span>
      <span>{snapshot?.zoneId ?? "loading"} · segment {snapshot?.segmentIndex ?? 0}</span>
      <span>signature {snapshot?.segmentSignature ?? "—"}</span>
      <span>locomotion {locomotionPhase}</span>
      <span>{snapshot?.fps ?? 0} fps · p95 {snapshot?.p95FrameMs ?? 0}ms</span>
      <span>objects {snapshot?.liveObjects ?? 0}/{snapshot?.pooledObjects ?? 0}</span>
      <span>textures {((snapshot?.estimatedTextureBytes ?? 0) / 1_048_576).toFixed(1)} MiB</span>
    </aside>
  );
}
import { useSyncExternalStore } from "react";
