"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import walkSheetAsset from "../../../art/phase2/traveler/production-v2/walk-sheet.png";
import actionSheetAsset from "../../../art/phase2/traveler/production-v2/action-sheet.png";
import transitionSheetAsset from "../../../art/phase2/traveler/production-v2/transition-sheet.png";
import type { CountryPack, SpriteManifest, TravelerState } from "@/lib/content/schema";
import { travelerMotionAt } from "@/lib/traveler/motion-clock";
import type { TravelerCommand } from "@/lib/traveler/types";
import { extrapolatedRouteDistance, extrapolatedRouteSeconds } from "@/lib/world/route-clock";

type Props = {
  command: TravelerCommand;
  pack: CountryPack;
  onReady: () => void;
};

type SheetName = "walk" | "action" | "transition";
type FrameSource = { sheet: SheetName; index: number };
type PreparedSheets = Record<SheetName, CanvasImageSource>;

const OUTPUT_WIDTH = 540;
const OUTPUT_HEIGHT = 960;
const SOURCE_COLUMNS = 4;
const SOURCE_ROWS = 2;
const SOURCE_CELL_WIDTH = 384;
const SOURCE_CELL_HEIGHT = 512;
const DESTINATION_WIDTH = 672;
const DESTINATION_HEIGHT = 896;
const DESTINATION_LEFT = (OUTPUT_WIDTH - DESTINATION_WIDTH) / 2;
const DESTINATION_TOP = 75;
const SOURCE_TO_OUTPUT_SCALE = DESTINATION_HEIGHT / SOURCE_CELL_HEIGHT;

const FRAME_TRANSLATIONS: Record<SheetName, ReadonlyArray<readonly [number, number]>> = {
  // Explicit source-space anchor corrections. They translate fixed cells onto
  // one body centre and foot baseline; no pose is independently resized.
  walk: [[-6, -11], [9, 0], [0, 8], [9, 1], [-12, 12], [5, 5], [0, 8], [14, 4]],
  action: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 14], [0, 14], [0, 14], [0, 14]],
  transition: [[0, 16], [0, 12], [0, -14], [0, -14], [0, 47], [0, 22], [0, 37], [0, 24]],
};

const ACTION_FRAMES = ["idle", "notice", "wave", "talk", "listen", "react", "phone", "photo"];
const TRANSITION_FRAMES = [
  "start-walk",
  "slow-walk",
  "stop",
  "drink",
  "rest",
  "goodbye",
  "resume-walk",
  "idle-alt",
];

function assetUrl(asset: string | { src: string }) {
  return typeof asset === "string" ? asset : asset.src;
}

export function sourceForFrame(src: string): FrameSource | null {
  const name = src.split("/").pop()?.replace(/\.webp$/, "");
  if (!name) return null;
  const walkMatch = name.match(/^walk-([1-8])$/);
  if (walkMatch) return { sheet: "walk", index: Number(walkMatch[1]) - 1 };
  const actionIndex = ACTION_FRAMES.indexOf(name);
  if (actionIndex >= 0) return { sheet: "action", index: actionIndex };
  const transitionIndex = TRANSITION_FRAMES.indexOf(name);
  if (transitionIndex >= 0) return { sheet: "transition", index: transitionIndex };
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to decode traveler sheet: ${src}`));
    image.src = src;
    if (image.complete && image.naturalWidth > 0) resolve(image);
  });
}

function removeMagentaMatte(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset]!;
    const green = data[offset + 1]!;
    const blue = data[offset + 2]!;
    const dominance = Math.min(red - green, blue - green);
    if (red <= 58 || blue <= 48 || dominance <= 8) continue;
    const keyStrength = Math.min(1, Math.max(0, (dominance - 8) / 32));
    data[offset + 3] = Math.round(data[offset + 3]! * (1 - keyStrength));
    if (keyStrength > 0 && data[offset + 3]! > 0) {
      const spill = Math.max(0, dominance) * keyStrength;
      data[offset] = Math.max(green, Math.round(red - spill * 0.72));
      data[offset + 2] = Math.max(green, Math.round(blue - spill * 0.72));
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

let preparedSheets: Promise<PreparedSheets> | null = null;

function preloadSheets() {
  preparedSheets ??= Promise.all([
    loadImage(assetUrl(walkSheetAsset)),
    loadImage(assetUrl(actionSheetAsset)),
    loadImage(assetUrl(transitionSheetAsset)),
  ]).then(([walk, action, transition]) => ({
    walk,
    action: removeMagentaMatte(action),
    transition: removeMagentaMatte(transition),
  }));
  return preparedSheets;
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

export function frameIndexForState(
  state: TravelerState,
  manifest: SpriteManifest,
  gaitFrameIndex: number,
  clockSeconds: number,
  actionProgress?: number,
) {
  const clip = manifest.clips[state] ?? manifest.clips.idle;
  if (!clip) return 0;
  if (["start_walk", "walk", "slow_walk", "approach", "resume_walk"].includes(state)) {
    return gaitFrameIndex % clip.frames.length;
  }
  if (actionProgress !== undefined && !clip.loop) {
    return Math.min(clip.frames.length - 1, Math.floor(actionProgress * clip.frames.length));
  }
  return clip.loop
    ? Math.floor(clockSeconds * clip.framesPerSecond) % clip.frames.length
    : Math.min(clip.frames.length - 1, Math.floor(clockSeconds * clip.framesPerSecond));
}

export function SpriteTravelerRenderer({ command, pack, onReady }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const commandRef = useRef(command);
  const [sheets, setSheets] = useState<PreparedSheets | null>(null);
  const [sheetsFailed, setSheetsFailed] = useState(false);
  const reported = useRef(false);

  useEffect(() => {
    commandRef.current = command;
  }, [command]);

  const reportReady = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onReady();
  }, [onReady]);

  useEffect(() => {
    let disposed = false;
    void preloadSheets()
      .then((prepared) => {
        if (disposed) return;
        setSheets(prepared);
        reportReady();
      })
      .catch(() => {
        if (disposed) return;
        setSheetsFailed(true);
        reportReady();
      });
    const fallback = window.setTimeout(reportReady, 2_500);
    return () => {
      disposed = true;
      window.clearTimeout(fallback);
    };
  }, [reportReady]);

  useEffect(() => {
    if (!sheets || !canvas.current || !pack.traveler.spriteManifest) return;
    const manifest = pack.traveler.spriteManifest;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    let animationFrame = 0;
    let lastFrameKey = "";

    const drawSource = (source: FrameSource, alpha = 1) => {
      const column = source.index % SOURCE_COLUMNS;
      const row = Math.floor(source.index / SOURCE_COLUMNS) % SOURCE_ROWS;
      const [translateX, translateY] = FRAME_TRANSLATIONS[source.sheet][source.index] ?? [0, 0];
      context.save();
      context.globalAlpha = alpha;
      context.drawImage(
        sheets[source.sheet],
        column * SOURCE_CELL_WIDTH,
        row * SOURCE_CELL_HEIGHT,
        SOURCE_CELL_WIDTH,
        SOURCE_CELL_HEIGHT,
        DESTINATION_LEFT + translateX * SOURCE_TO_OUTPUT_SCALE,
        DESTINATION_TOP + translateY * SOURCE_TO_OUTPUT_SCALE,
        DESTINATION_WIDTH,
        DESTINATION_HEIGHT,
      );
      context.restore();
    };

    const render = () => {
      const current = commandRef.current;
      const sampleAt = Math.min(Date.now(), current.motionSampleUntilMs);
      const rawSeconds = extrapolatedRouteSeconds(current.routeRuntime, sampleAt);
      const distanceMetres = extrapolatedRouteDistance(current.routeRuntime, sampleAt);
      const motion = travelerMotionAt(pack, rawSeconds, distanceMetres);
      const state = current.walking && motion.action ? motion.action.state : current.state;
      const clip = manifest.clips[state] ?? manifest.clips.idle;
      if (clip) {
        const livingClockSeconds = current.walking ? motion.locomotionSeconds : Date.now() / 1_000;
        const frameIndex = frameIndexForState(
          state,
          manifest,
          motion.gaitFrameIndex,
          livingClockSeconds,
          motion.action?.progress,
        );
        const frameSrc = clip.frames[frameIndex % clip.frames.length]!;
        const source = sourceForFrame(frameSrc);
        const metadata = clip.metadata[frameIndex % clip.metadata.length];
        const movingState = ["start_walk", "walk", "slow_walk", "approach", "resume_walk"].includes(state);
        const nextMetadata = movingState
          ? clip.metadata[(frameIndex + 1) % clip.metadata.length]
          : metadata;
        const metadataBlend = movingState ? (motion.cyclePhase * clip.frames.length) % 1 : 0;
        const shadowScale = metadata && nextMetadata
          ? lerp(metadata.shadowScale, nextMetadata.shadowScale, metadataBlend)
          : 1;
        const sponsorX = metadata && nextMetadata
          ? lerp(metadata.sponsorAnchor.x, nextMetadata.sponsorAnchor.x, metadataBlend)
          : 0.35;
        const sponsorY = metadata && nextMetadata
          ? lerp(metadata.sponsorAnchor.y, nextMetadata.sponsorAnchor.y, metadataBlend)
          : 0.385;
        const sponsorScale = metadata && nextMetadata
          ? lerp(metadata.sponsorAnchor.scale, nextMetadata.sponsorAnchor.scale, metadataBlend)
          : 0.105;
        const sponsorRotation = metadata && nextMetadata
          ? lerp(metadata.sponsorAnchor.rotation, nextMetadata.sponsorAnchor.rotation, metadataBlend)
          : 0;
        const frameKey = `${source?.sheet}:${source?.index}:${state}`;
        if (source && (movingState || frameKey !== lastFrameKey)) {
          context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
          drawSource(source);
          if (movingState) {
            const nextFrameSrc = clip.frames[(frameIndex + 1) % clip.frames.length]!;
            const nextSource = sourceForFrame(nextFrameSrc);
            const blendStart = 0.62;
            const blendProgress = Math.max(0, Math.min(1, (metadataBlend - blendStart) / (1 - blendStart)));
            const easedBlend = blendProgress * blendProgress * (3 - 2 * blendProgress);
            if (nextSource && easedBlend > 0) drawSource(nextSource, easedBlend * 0.42);
          }
          lastFrameKey = frameKey;
        }
        if (root.current) {
          root.current.dataset.state = state;
          root.current.dataset.walking = String(current.walking && !motion.action);
          root.current.style.setProperty("--shadow-scale", String(shadowScale));
          root.current.style.setProperty("--sponsor-x", `${sponsorX * 100}%`);
          root.current.style.setProperty("--sponsor-y", `${sponsorY * 100}%`);
          root.current.style.setProperty("--sponsor-scale", String(sponsorScale));
          root.current.style.setProperty("--sponsor-rotation", `${sponsorRotation}deg`);
          root.current.style.setProperty("--gait-phase", String(motion.cyclePhase));
          const lifePhase = current.walking && !motion.action
            ? 0
            : Math.sin(livingClockSeconds * Math.PI * 0.7);
          root.current.style.setProperty("--alive-y", `${lifePhase * -0.12}%`);
          root.current.style.setProperty("--alive-rotation", `${lifePhase * 0.08}deg`);
        }
      }
      animationFrame = window.requestAnimationFrame(render);
    };
    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [pack, sheets]);

  const fallbackState = command.state === "loading" ? "idle" : command.state;
  const fallbackSrc = pack.traveler.fallbackSprites[fallbackState]
    ?? pack.traveler.fallbackSprites.idle;
  const style = {
    "--shadow-scale": 1,
    "--sponsor-x": "34%",
    "--sponsor-y": "34%",
    "--sponsor-scale": 0.13,
    "--sponsor-rotation": "0deg",
    "--alive-y": "0%",
    "--alive-rotation": "0deg",
  } as CSSProperties;

  return (
    <div
      ref={root}
      className="traveler-sprite"
      data-state={command.state}
      data-walking={command.walking}
      data-reduced-motion={command.reducedMotion}
      data-renderer={sheets ? "sheet" : "fallback"}
      style={style}
    >
      <div className="character-shadow" aria-hidden="true" />
      <canvas
        ref={canvas}
        className="traveler-frame traveler-sheet-frame"
        width={OUTPUT_WIDTH}
        height={OUTPUT_HEIGHT}
        aria-hidden="true"
      />
      {fallbackSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="traveler-frame traveler-fallback-frame"
          src={fallbackSrc}
          alt=""
          draggable={false}
          onLoad={reportReady}
          data-visible={!sheets || sheetsFailed}
        />
      ) : null}
      {command.sponsorPatchUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="traveler-sponsor-patch" src={command.sponsorPatchUrl} alt="" draggable={false} />
      ) : null}
    </div>
  );
}
