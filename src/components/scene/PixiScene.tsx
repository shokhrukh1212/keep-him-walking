"use client";

import { useEffect, useRef } from "react";
import type { Texture as PixiTexture } from "pixi.js";
import type { CountryPack, RouteProp, RouteZone } from "@/lib/content/schema";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import { deterministicVariant, extrapolatedRouteSeconds, routePositionAt } from "@/lib/world/route-clock";
import { segmentVariant } from "@/lib/world/segment-sequencer";
import { composedSegmentSignature } from "@/lib/world/segment-sequencer";
import type { QualityTier, RouteRuntime, WorldCommand, WorldDiagnosticsSnapshot } from "@/lib/world/types";

type Props = {
  pack: CountryPack;
  routeSeconds: number;
  routeRuntime: RouteRuntime;
  command: WorldCommand;
  reducedMotion: boolean;
  qualityTier: QualityTier;
  onZoneChange: (zoneId: string, zoneLabel: string) => void;
  onDiagnostics: (snapshot: WorldDiagnosticsSnapshot) => void;
  onReady: () => void;
  onFailure: () => void;
};

type RuntimeRefs = Pick<Props, "routeSeconds" | "routeRuntime" | "command" | "reducedMotion">;

export function PixiScene({
  pack,
  routeSeconds,
  routeRuntime,
  command,
  reducedMotion,
  qualityTier,
  onZoneChange,
  onDiagnostics,
  onReady,
  onFailure,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<RuntimeRefs>({ routeSeconds, routeRuntime, command, reducedMotion });
  const zoneCallback = useRef(onZoneChange);
  const diagnosticsCallback = useRef(onDiagnostics);

  useEffect(() => {
    runtime.current = { routeSeconds, routeRuntime, command, reducedMotion };
    zoneCallback.current = onZoneChange;
    diagnosticsCallback.current = onDiagnostics;
  }, [command, onDiagnostics, onZoneChange, reducedMotion, routeRuntime, routeSeconds]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined;

    async function mount() {
      const element = host.current;
      if (!element) return;
      try {
        const { Application, Assets, Container, Graphics, Sprite } = await import("pixi.js");
        if (disposed) return;
        const limits = QUALITY_LIMITS[qualityTier];
        const app = new Application();
        await app.init({
          resizeTo: element,
          backgroundAlpha: 0,
          antialias: qualityTier !== "low",
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, limits.resolution),
          preference: "webgl",
          powerPreference: "high-performance",
        });
        if (disposed) {
          app.destroy(true);
          return;
        }
        app.ticker.maxFPS = limits.targetFps;
        app.canvas.setAttribute("aria-hidden", "true");
        element.appendChild(app.canvas);

        const camera = new Container();
        const sky = new Graphics();
        const layerRoot = new Container();
        const propRoot = new Container();
        const weatherRoot = new Container();
        camera.addChild(sky, layerRoot, propRoot, weatherRoot);
        app.stage.addChild(camera);

        type LayerPool = {
          speed: number;
          y: number;
          height: number;
          layerIndex: number;
          sequenceLayerIndex: number;
          textures: PixiTexture[];
          sprites: InstanceType<typeof Sprite>[];
        };
        type PropPool = {
          definition: RouteProp;
          display: InstanceType<typeof Graphics> | InstanceType<typeof Sprite>;
          illustrated: boolean;
          nativeHeight: number;
          slot: number;
        };
        let pools: LayerPool[] = [];
        let props: PropPool[] = [];
        let motes: InstanceType<typeof Graphics>[] = [];
        let activeZone: RouteZone | null = null;
        let activeZoneIndex = -1;
        let pendingZoneIndex = -1;
        let buildGeneration = 0;
        let ready = false;
        let estimatedTextureBytes = 0;
        let zoneFade = 1;

        const zoneAssetUrls = (zone: RouteZone) => [
          ...zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
          ...zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : []),
        ];

        const drawProp = (graphic: InstanceType<typeof Graphics>, definition: RouteProp) => {
          const [primary = "#315d4d", secondary = "#d9a75a"] = definition.colors;
          graphic.clear();
          if (definition.kind === "tree") {
            graphic.rect(-7, -72, 14, 72).fill(primary);
            graphic.circle(0, -96, 40).fill(secondary);
            graphic.circle(-24, -80, 26).fill(secondary);
            graphic.circle(25, -78, 29).fill(secondary);
          } else if (definition.kind === "lamp" || definition.kind === "signpost") {
            graphic.rect(-4, -92, 8, 92).fill(primary);
            graphic.roundRect(-17, -111, 34, 25, 8).fill(secondary);
          } else if (definition.kind === "bench") {
            graphic.roundRect(-42, -34, 84, 14, 5).fill(primary);
            graphic.rect(-34, -20, 7, 20).fill(secondary);
            graphic.rect(27, -20, 7, 20).fill(secondary);
          } else if (definition.kind === "awning") {
            graphic.poly([-50, -62, 50, -62, 38, -36, -38, -36]).fill(primary);
            graphic.rect(-40, -36, 5, 36).fill(secondary);
            graphic.rect(35, -36, 5, 36).fill(secondary);
          } else if (definition.kind === "stall") {
            graphic.rect(-48, -52, 96, 52).fill(primary);
            graphic.poly([-56, -54, 56, -54, 42, -80, -42, -80]).fill(secondary);
          } else {
            graphic.roundRect(-34, -27, 68, 27, 8).fill(primary);
            graphic.circle(-17, -35, 17).fill(secondary);
            graphic.circle(15, -38, 20).fill(secondary);
          }
          graphic.alpha = 0.84;
        };

        const buildZone = async (zoneIndex: number) => {
          pendingZoneIndex = zoneIndex;
          const generation = ++buildGeneration;
          const zone = pack.route.zones[zoneIndex];
          const loaded = await Promise.all(
            zone.layers.map(async (layer) => ({
              layer,
              textures: await Promise.all(
                layer.segments.map((segment) => Assets.load<PixiTexture>(segment.url)),
              ),
            })),
          );
          const propTextures = await Promise.all(
            zone.props.map((prop) => prop.assetUrl
              ? Assets.load<PixiTexture>(prop.assetUrl)
              : Promise.resolve(null)),
          );
          if (disposed || generation !== buildGeneration) return;

          layerRoot.removeChildren().forEach((child) => child.destroy());
          propRoot.removeChildren().forEach((child) => child.destroy());
          weatherRoot.removeChildren().forEach((child) => child.destroy());
          let sequenceLayerIndex = 0;
          pools = loaded.map(({ layer, textures }, layerIndex) => {
            const container = new Container();
            layerRoot.addChild(container);
            const sprites = Array.from({ length: 6 }, () => {
              const sprite = new Sprite(textures[0]);
              container.addChild(sprite);
              return sprite;
            });
            const pool = {
              speed: layer.speed,
              y: layer.y,
              height: layer.height,
              layerIndex,
              sequenceLayerIndex,
              textures,
              sprites,
            };
            if (textures.length > 1) sequenceLayerIndex += 1;
            return pool;
          });
          estimatedTextureBytes = loaded.reduce(
            (total, item) => total + item.textures.reduce(
              (layerTotal, texture) => layerTotal + texture.width * texture.height * 4,
              0,
            ),
            0,
          ) + propTextures.reduce(
            (total, texture) => total + (texture ? texture.width * texture.height * 4 : 0),
            0,
          );

          props = Array.from({ length: limits.maxProps }, (_, slot) => {
            const definition = zone.props[slot % zone.props.length];
            const texture = propTextures[slot % zone.props.length];
            if (texture) {
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5, 1);
              propRoot.addChild(sprite);
              return { definition, display: sprite, illustrated: true, nativeHeight: texture.height, slot };
            }
            const graphic = new Graphics();
            drawProp(graphic, definition);
            propRoot.addChild(graphic);
            return { definition, display: graphic, illustrated: false, nativeHeight: 1, slot };
          });
          motes = Array.from({ length: limits.motes }, (_, index) => {
            const mote = new Graphics();
            mote.circle(0, 0, 1 + (index % 3) * 0.7).fill({ color: 0xffe4a1, alpha: 0.3 });
            weatherRoot.addChild(mote);
            return mote;
          });
          activeZone = zone;
          activeZoneIndex = zoneIndex;
          pendingZoneIndex = -1;
          zoneFade = ready ? 0 : 1;
          sky.clear().rect(0, 0, app.screen.width, app.screen.height).fill(zone.lighting.skyTop);
          layerRoot.alpha = zoneFade;
          propRoot.alpha = zoneFade;
          zoneCallback.current(zone.id, zone.label);
          const nextZone = pack.route.zones[(zoneIndex + 1) % pack.route.zones.length];
          void Assets.backgroundLoad(zoneAssetUrls(nextZone)).catch(() => undefined);
          if (!ready) {
            ready = true;
            onReady();
          }
        };

        const resize = () => {
          sky.clear();
          if (activeZone) {
            sky.rect(0, 0, app.screen.width, app.screen.height).fill(activeZone.lighting.skyTop);
          }
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);

        let displayedSeconds = runtime.current.routeSeconds;
        let elapsed = 0;
        let lastTickAt = performance.now();
        let lastDiagnosticAt = 0;
        const frameSamples: number[] = [];
        app.ticker.add(() => {
          if (document.hidden) return;
          const state = runtime.current;
          const tickAt = performance.now();
          const wallDeltaMs = Math.min(500, Math.max(0, tickAt - lastTickAt));
          lastTickAt = tickAt;
          const deltaSeconds = wallDeltaMs / 1_000;
          elapsed += wallDeltaMs;
          frameSamples.push(wallDeltaMs);
          if (frameSamples.length > 180) frameSamples.shift();
          const target = extrapolatedRouteSeconds(state.routeRuntime, Date.now());
          if (!state.reducedMotion) {
            const drift = target - displayedSeconds;
            const maxCorrection = deltaSeconds * Math.max(0.02, state.command.speedFactor) * 1.4;
            displayedSeconds += Math.max(-maxCorrection, Math.min(maxCorrection, drift));
          } else {
            displayedSeconds = target;
          }

          const position = routePositionAt(pack, displayedSeconds);
          const zoneDistance = position.zoneElapsedSeconds * pack.route.worldUnitsPerSecond;
          if (position.zoneIndex !== activeZoneIndex && position.zoneIndex !== pendingZoneIndex) {
            void buildZone(position.zoneIndex).catch((error: unknown) => {
              pendingZoneIndex = -1;
              if (process.env.NODE_ENV !== "production") {
                console.error("World zone load failed", error);
              }
              onFailure();
            });
          }
          if (!activeZone) return;

          const width = app.screen.width;
          const height = app.screen.height;
          camera.pivot.set(width / 2, height / 2);
          camera.position.set(width / 2 + state.command.cameraPan * width, height / 2);
          camera.scale.set(state.reducedMotion ? 1 : state.command.cameraZoom);
          zoneFade = Math.min(1, zoneFade + deltaSeconds * 2.4);
          layerRoot.alpha = zoneFade;
          propRoot.alpha = zoneFade * (0.72 + state.command.backgroundLife * 0.28);
          weatherRoot.alpha = 0.5 + state.command.backgroundLife * 0.5;
          for (const pool of pools) {
            const targetHeight = height * pool.height;
            const sampleTexture = pool.textures[0];
            const scale = targetHeight / Math.max(1, sampleTexture.height);
            const segmentWidth = Math.max(180, sampleTexture.width * scale);
            const cameraPixels = zoneDistance * pool.speed * (width / 1_600);
            const firstIndex = Math.floor(cameraPixels / segmentWidth) - 1;
            for (let slot = 0; slot < pool.sprites.length; slot += 1) {
              const segmentIndex = firstIndex + slot;
              const sprite = pool.sprites[slot];
              const variant = segmentVariant(
                activeZone.id,
                segmentIndex,
                pool.sequenceLayerIndex,
                pool.textures.length,
              );
              sprite.texture = pool.textures[variant];
              sprite.scale.set(scale);
              sprite.x = segmentIndex * segmentWidth - cameraPixels;
              sprite.y = height * pool.y;
              sprite.visible = sprite.x + segmentWidth > -4 && sprite.x < width + 4;
            }
          }

          const propSpacing = width < 500 ? 390 : 470;
          for (const item of props) {
            const depthSpeed = 0.42 + Math.min(1.2, item.definition.depth) * 0.48;
            const propCamera = zoneDistance * depthSpeed * (width / 1_600);
            const firstProp = Math.floor(propCamera / propSpacing) - 2;
            const index = firstProp + item.slot;
            const jitter = deterministicVariant(
              `${activeZone.id}:${item.definition.id}`,
              index,
              180,
            );
            item.display.x = index * propSpacing + jitter - propCamera;
            item.display.y = height * (0.79 + (item.definition.depth - 0.65) * 0.12);
            if (item.illustrated) {
              const targetRatio = item.definition.kind === "tree"
                ? 0.34
                : item.definition.kind === "lamp"
                  ? 0.27
                  : item.definition.kind === "awning" || item.definition.kind === "stall"
                    ? 0.24
                    : 0.16;
              const scale = height * targetRatio * item.definition.depth / Math.max(1, item.nativeHeight);
              item.display.scale.set(scale);
            } else {
              item.display.scale.set(
                Math.max(0.68, Math.min(1.25, item.definition.depth)) * height / 850,
              );
            }
            item.display.visible = item.display.x > -180 && item.display.x < width + 180;
          }

          for (let index = 0; index < motes.length; index += 1) {
            const mote = motes[index];
            mote.x = ((index * 173 + elapsed * (0.006 + (index % 4) * 0.002)) % (width + 80)) - 40;
            mote.y =
              70 +
              ((index * 97 + Math.sin(elapsed * 0.0007 + index) * 18) %
                Math.max(100, height * 0.62));
          }
          if (elapsed - lastDiagnosticAt >= 1_000 && frameSamples.length > 0) {
            lastDiagnosticAt = elapsed;
            const sorted = [...frameSamples].sort((a, b) => a - b);
            const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
            const average = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;
            const groundPool = pools[pools.length - 1];
            const groundHeight = groundPool ? height * groundPool.height : height * 0.24;
            const groundTexture = groundPool?.textures[0];
            const groundWidth = groundTexture
              ? groundTexture.width * (groundHeight / Math.max(1, groundTexture.height))
              : width;
            const segmentIndex = Math.floor((position.distance * (width / 1_600)) / Math.max(1, groundWidth));
            const visibleObjects = pools.flatMap((pool) => pool.sprites).filter((sprite) => sprite.visible).length
              + props.filter((item) => item.display.visible).length
              + motes.length;
            diagnosticsCallback.current({
              routeSeconds: displayedSeconds,
              distance: position.distance,
              zoneId: activeZone.id,
              segmentIndex,
              segmentSignature: `${composedSegmentSignature(
                activeZone.id,
                segmentIndex,
                pools.map((pool) => pool.textures.length),
              )}:p${segmentVariant(activeZone.id, segmentIndex, 0, 12)}`,
              fps: Math.round(1_000 / Math.max(1, average)),
              p95FrameMs: Math.round(p95 * 10) / 10,
              liveObjects: visibleObjects,
              pooledObjects: pools.reduce((total, pool) => total + pool.sprites.length, 0) + props.length + motes.length,
              estimatedTextureBytes,
            });
          }
        });

        const initialZoneIndex = routePositionAt(pack, displayedSeconds).zoneIndex;
        const initialNextZone = pack.route.zones[(initialZoneIndex + 1) % pack.route.zones.length];
        void Assets.backgroundLoad(zoneAssetUrls(initialNextZone)).catch(() => undefined);
        await buildZone(initialZoneIndex);
        resize();
        cleanup = () => {
          observer.disconnect();
          app.destroy(true, { children: true });
        };
      } catch {
        onFailure();
      }
    }

    void mount();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [onFailure, onReady, pack, qualityTier]);

  return <div className="pixi-scene" ref={host} aria-hidden="true" />;
}
