"use client";

import { useEffect, useRef } from "react";
import type { CountryPack } from "@/lib/content/schema";

type Props = {
  pack: CountryPack;
  walking: boolean;
  reducedMotion: boolean;
  onReady: () => void;
  onFailure: () => void;
};

const BAND_TOP: Record<string, number> = {
  sky: 0,
  city: 0.28,
  street: 0.57,
  foreground: 0.79,
};

export function PixiScene({ pack, walking, reducedMotion, onReady, onFailure }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const walkingRef = useRef(walking);
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    walkingRef.current = walking;
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion, walking]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined;

    async function mount() {
      const element = host.current;
      if (!element) return;
      try {
        const { Application, Assets, Container, Graphics, Sprite } = await import("pixi.js");
        if (disposed) return;
        const app = new Application();
        await app.init({
          resizeTo: element,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 1.6),
          preference: "webgl",
        });
        if (disposed) {
          app.destroy(true);
          return;
        }
        app.canvas.setAttribute("aria-hidden", "true");
        element.appendChild(app.canvas);

        const world = new Container();
        app.stage.addChild(world);
        const sprites: Array<{ sprite: InstanceType<typeof Sprite>; speed: number; id: string }> = [];
        for (const layer of pack.scene.layers) {
          const texture = await Assets.load(layer.url);
          if (disposed) return;
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5, 0);
          world.addChild(sprite);
          sprites.push({ sprite, speed: layer.speed, id: layer.id });
        }

        const motes = new Graphics();
        for (let index = 0; index < 18; index += 1) {
          const x = (index * 137) % 1000;
          const y = 80 + ((index * 83) % 420);
          const radius = 1 + (index % 3) * 0.7;
          motes.circle(x, y, radius).fill({ color: 0xffe3a0, alpha: 0.28 });
        }
        world.addChild(motes);

        const resize = () => {
          const width = app.screen.width;
          const height = app.screen.height;
          for (const item of sprites) {
            const textureWidth = item.sprite.texture.width;
            const textureHeight = item.sprite.texture.height;
            const bandTop = BAND_TOP[item.id] ?? 0;
            const targetWidth = width * 1.06;
            const scale = targetWidth / textureWidth;
            item.sprite.scale.set(scale);
            item.sprite.x = width / 2;
            item.sprite.y = height * bandTop;
            if (item.id === "sky") {
              item.sprite.height = Math.max(height * 0.6, textureHeight * scale);
            }
          }
          motes.scale.set(width / 1000, height / 700);
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(element);

        const pointer = { x: 0 };
        const onPointerMove = (event: PointerEvent) => {
          pointer.x = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
        };
        window.addEventListener("pointermove", onPointerMove, { passive: true });

        let elapsed = 0;
        app.ticker.add((ticker) => {
          if (document.hidden || reducedMotionRef.current) return;
          elapsed += ticker.deltaMS;
          const drift = Math.sin(elapsed * 0.00011) * (walkingRef.current ? 6 : 2);
          for (const item of sprites) {
            item.sprite.x = app.screen.width / 2 + drift * item.speed + pointer.x * 12 * item.speed;
          }
          motes.alpha = 0.72 + Math.sin(elapsed * 0.001) * 0.12;
          motes.y = Math.sin(elapsed * 0.00035) * 5;
        });

        cleanup = () => {
          observer.disconnect();
          window.removeEventListener("pointermove", onPointerMove);
          app.destroy(true, { children: true });
        };
        onReady();
      } catch {
        onFailure();
      }
    }

    void mount();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [onFailure, onReady, pack]);

  return <div className="pixi-scene" ref={host} aria-hidden="true" />;
}
