"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { CountryPack } from "@/lib/content/schema";
import { StaticScene } from "./StaticScene";

const PixiScene = dynamic(
  () => import("./PixiScene").then((module) => module.PixiScene),
  { ssr: false },
);

type Props = {
  pack: CountryPack;
  walking: boolean;
  reducedMotion: boolean;
  onReady: (renderer: "pixi" | "static") => void;
};

export function SceneStage({ pack, walking, reducedMotion, onReady }: Props) {
  const [pixiFailed, setPixiFailed] = useState(false);
  const [pixiReady, setPixiReady] = useState(false);
  const staticReady = useCallback(() => onReady("static"), [onReady]);
  const liveReady = useCallback(() => {
    setPixiReady(true);
    onReady("pixi");
  }, [onReady]);
  const liveFailed = useCallback(() => setPixiFailed(true), []);

  return (
    <div className="scene-stage" data-renderer={pixiReady ? "pixi" : "static"}>
      <StaticScene src={pack.scene.fallbackUrl} onReady={staticReady} />
      {!reducedMotion && !pixiFailed ? (
        <PixiScene
          pack={pack}
          walking={walking}
          reducedMotion={reducedMotion}
          onReady={liveReady}
          onFailure={liveFailed}
        />
      ) : null}
      <div className="scene-grade" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />
    </div>
  );
}
