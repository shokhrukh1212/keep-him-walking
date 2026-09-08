"use client";

import { useEffect, useRef } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { RouteZone } from "@/lib/content/schema";
import { stageLayout, type StageFrame } from "@/lib/world/stage-layout";
import { CHARACTER_HEIGHT_TARGETS } from "@/lib/world/stage-targets";

type Props = {
  src: string;
  zone: RouteZone;
  assetVersion: string;
  active: boolean;
  onStageFrame: (frame: StageFrame, source: "static" | "pixi") => void;
  onReady: () => void;
};

export function StaticScene({ src, zone, assetVersion, active, onStageFrame, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const reported = useRef(false);
  const report = () => {
    if (reported.current) return;
    reported.current = true;
    onReady();
  };

  useEffect(() => {
    const timeout = window.setTimeout(report, 2_500);
    return () => window.clearTimeout(timeout);
  });

  useEffect(() => {
    const element = host.current;
    const img = picture.current;
    if (!element || !img) return;
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height || !img.naturalWidth || !img.naturalHeight) return;
      const layout = stageLayout(
        width, height, img.naturalWidth, img.naturalHeight, zone.stage, CHARACTER_HEIGHT_TARGETS,
      );
      element.dataset.characterImageScale = String(layout.characterImageScale);
      Object.assign(img.style, {
        width: `${img.naturalWidth * layout.imageScale}px`,
        height: `${img.naturalHeight * layout.imageScale}px`,
        left: `${layout.imageX}px`, top: `${layout.imageY}px`,
      });
      element.style.background = `linear-gradient(to bottom, ${zone.lighting.skyTop} ${layout.groundY}px, ${zone.stage.palette[0]} ${layout.groundY}px)`;
      if (active) onStageFrame({ assetVersion, zoneId: zone.id, viewportW: width, viewportH: height,
        imageW: img.naturalWidth, imageH: img.naturalHeight, stage: zone.stage, layout }, "static");
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    img.addEventListener("load", resize);
    resize();
    return () => { observer.disconnect(); img.removeEventListener("load", resize); };
  }, [src, zone, assetVersion, active, onStageFrame]);

  return (
    <div className="static-scene" ref={host} aria-hidden="true">
      {/* A CSS gradient remains behind the asset if image decoding fails. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={picture} src={publicAssetUrl(src)} crossOrigin="anonymous" alt="" onLoad={report} onError={report} draggable={false} />
    </div>
  );
}
