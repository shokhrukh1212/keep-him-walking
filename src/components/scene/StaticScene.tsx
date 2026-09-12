"use client";

import { useEffect, useRef, useState } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { RouteZone } from "@/lib/content/schema";
import {
  placeRenditions,
  renditionRequestFor,
  shouldReplaceRendition,
  type RenditionChoice,
} from "@/lib/world/scene-assets";
import { stageLayout, type StageFrame } from "@/lib/world/stage-layout";
import { CHARACTER_HEIGHT_TARGETS } from "@/lib/world/stage-targets";

type Props = {
  zone: RouteZone;
  assetVersion: string;
  active: boolean;
  /** The device pixels per CSS pixel the live world draws at; null until the device tier is known. */
  resolution: number | null;
  onStageFrame: (frame: StageFrame, source: "static" | "pixi") => void;
  onReady: () => void;
};

/**
 * The poster under the live world, and the whole world when WebGL is unavailable.
 * It asks for the same rendition the live world will, so a first visit downloads
 * each painting once, and it stops following the route once the live world is up.
 */
export function StaticScene({ zone, assetVersion, active, resolution, onStageFrame, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const reported = useRef(false);
  const onReadyRef = useRef(onReady);
  const [rendition, setRendition] = useState<{ zoneId: string; choice: RenditionChoice } | null>(null);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const report = () => {
    if (reported.current) return;
    reported.current = true;
    onReadyRef.current();
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      onReadyRef.current();
    }, 2_500);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element || resolution === null) return;
    let frame = 0;
    const choose = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      const next = placeRenditions(zone, renditionRequestFor(zone, width, height, resolution)).city;
      setRendition((current) => {
        // Behind a running world the poster keeps what it has.
        if (current && !active) return current;
        if (current?.zoneId === zone.id
          && (current.choice.url === next.url || !shouldReplaceRendition(current.choice, next))) {
          return current;
        }
        return { zoneId: zone.id, choice: next };
      });
    };
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(choose);
    });
    observer.observe(element);
    frame = window.requestAnimationFrame(choose);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [active, resolution, zone]);

  const shown = rendition?.zoneId === zone.id ? rendition.choice : null;

  useEffect(() => {
    const element = host.current;
    const img = picture.current;
    if (!element) return;
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      const nominalWidth = zone.variants?.nominalWidth ?? img?.naturalWidth ?? 0;
      const nominalHeight = zone.variants?.nominalHeight ?? img?.naturalHeight ?? 0;
      if (!width || !height || !nominalWidth || !nominalHeight) return;
      const layout = stageLayout(
        width, height, nominalWidth, nominalHeight, zone.stage, CHARACTER_HEIGHT_TARGETS,
      );
      element.dataset.characterImageScale = String(layout.characterImageScale);
      if (img && shown) {
        const coverWidth = shown.nominalWidth || nominalWidth;
        Object.assign(img.style, {
          width: `${coverWidth * layout.imageScale}px`,
          height: `${nominalHeight * layout.imageScale}px`,
          left: `${layout.imageX + shown.nominalLeft * layout.imageScale}px`,
          top: `${layout.imageY}px`,
        });
      }
      element.style.background = `linear-gradient(to bottom, ${zone.lighting.skyTop} ${layout.groundY}px, ${zone.stage.palette[0]} ${layout.groundY}px)`;
      if (active) onStageFrame({ assetVersion, zoneId: zone.id, viewportW: width, viewportH: height,
        imageW: nominalWidth, imageH: nominalHeight, stage: zone.stage, layout }, "static");
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    img?.addEventListener("load", resize);
    resize();
    return () => { observer.disconnect(); img?.removeEventListener("load", resize); };
  }, [shown, zone, assetVersion, active, onStageFrame]);

  return (
    <div
      className="static-scene"
      ref={host}
      aria-hidden="true"
      data-rendition={rendition ? `${rendition.choice.crop}-${rendition.choice.width}` : undefined}
    >
      {/* A CSS gradient remains behind the asset if image decoding fails. */}
      {rendition ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={picture}
          src={publicAssetUrl(rendition.choice.url)}
          crossOrigin="anonymous"
          alt=""
          onLoad={report}
          onError={report}
          draggable={false}
        />
      ) : null}
    </div>
  );
}
